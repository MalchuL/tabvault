"""Saved Tab application service and transaction boundaries."""

from __future__ import annotations

import builtins

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from domain.custom_properties.repository import CustomPropertyRepository
from domain.custom_properties.service import CustomPropertyService
from lib.pagination import ListOptions
from lib.responses import WarningDTO
from lib.time import utc_now
from models import Tab

from .dto import (
    TabBatchCreateDTO,
    TabCreateDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabJobDTO,
    TabListOptionsDTO,
    TabListResponseDTO,
    TabReorderDTO,
    TabReorderResultDTO,
    TabUpdateDTO,
)
from .error import (
    ActiveTabDeleteError,
    DuplicateTabIdError,
    EmptyUpdateError,
    InvalidGroupError,
    InvalidTabOrderError,
    TabNotFoundError,
)
from .mapper import TabMapper
from .repository import TabRepository


class TabService:
    """Apply Saved Tab lifecycle rules and own their database transactions.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        repository (TabRepository): Persistence adapter retained for this service instance.
        custom_properties (Any): Service that validates the current library property schema.
        mapper (TabMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(
        self,
        db: AsyncSession,
        repository: TabRepository,
        custom_properties: CustomPropertyService | None = None,
    ) -> None:
        """Create a transaction-scoped service; tests may inject a schema service.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session.
            repository (TabRepository): Persistence adapter used by this service.
            custom_properties (CustomPropertyService | None): Service that validates library
                custom properties.
        """
        self.db = db
        self.repository = repository
        self.custom_properties = custom_properties or CustomPropertyService(
            db, CustomPropertyRepository(db)
        )
        self.mapper = TabMapper()

    async def _to_dto(self, tab: Tab) -> TabDTO:
        """Resolve current schema defaults while mapping one Saved Tab.

        Args:
            tab (Tab): Persistent row whose raw overrides are resolved for public output.

        Returns:
            TabDTO: Complete Saved Tab with declared resolved properties.
        """
        definitions = await self.custom_properties.definitions()
        resolved = self.custom_properties.resolve_values(tab.custom_properties, definitions)
        return self.mapper.to_dto(tab, resolved)

    async def _required_tab(self, tab_id: str) -> Tab:
        """Load a Saved Tab or raise the shared missing-ID domain error.

        Args:
            tab_id (str): Stable identifier of the saved tab.

        Returns:
            Tab: Tab row read or staged by this operation.

        Raises:
            TabNotFoundError: No saved tab has the requested ID.
        """
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return tab

    async def list(
        self, options: TabListOptionsDTO, list_options: ListOptions
    ) -> TabListResponseDTO:
        """List filtered Saved Tabs with database pagination and resolved properties.

        Args:
            options (TabListOptionsDTO): Validated filtering and sorting options.
            list_options (ListOptions): Page size and row offset for the query.

        Returns:
            TabListResponseDTO: Matching saved tabs and pagination metadata.
        """
        now = utc_now()
        page = await self.repository.list_tabs(
            group_id=options.group_id,
            category=options.category,
            tags_any=options.tags_any,
            tags_all=options.tags_all,
            search=options.search,
            sort_by=options.sort_by,
            sort_dir=options.sort_dir,
            list_options=list_options,
            visibility=options.visibility,
            now=now,
        )
        definitions = await self.custom_properties.definitions()
        return TabListResponseDTO.from_page(
            page.map(
                lambda row: self.mapper.to_projection(
                    row,
                    options.fields,
                    self.custom_properties.resolve_values(row.custom_properties, definitions),
                )
            )
        )

    async def get(self, tab_id: str) -> TabDTO:
        """Return one Saved Tab with current custom-property defaults applied.

        Args:
            tab_id (str): Stable identifier of the saved tab.

        Returns:
            TabDTO: Current saved-tab fields, tags, and metadata.
        """
        return await self._to_dto(await self._required_tab(tab_id))

    async def reorder(self, dto: TabReorderDTO) -> TabReorderResultDTO:
        """Atomically apply one relative order within a Group or Unassigned.

        The service validates the destination and delegates membership validation plus position
        normalization to the repository. All affected rows commit together; an invalid identifier
        rolls back the request without changing any position.

        Args:
            dto (TabReorderDTO): Membership scope and unique IDs in desired relative order.

        Returns:
            TabReorderResultDTO: Scope and caller-supplied IDs accepted by the transaction.

        Raises:
            InvalidGroupError: The requested non-null Group does not exist.
            InvalidTabOrderError: A supplied tab is missing, archived, or outside the requested
                membership scope.
        """
        if not await self.repository.active_group_exists(dto.group_id):
            raise InvalidGroupError(f"Group {dto.group_id!r} does not exist")
        try:
            if not await self.repository.reorder_tabs(dto.group_id, dto.tab_ids, utc_now()):
                raise InvalidTabOrderError(
                    "Every tabId must identify an active tab in the requested Group"
                )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return TabReorderResultDTO(group_id=dto.group_id, tab_ids=dto.tab_ids)

    async def create(self, dto: TabCreateDTO) -> tuple[TabDTO, TabJobDTO]:
        """Create one Saved Tab and preview job without merging matching URLs.

        Args:
            dto (TabCreateDTO): Validated request data for the operation.

        Returns:
            tuple[TabDTO, TabJobDTO]: Created tab and its queued preview job.

        Raises:
            InvalidGroupError: The destination group does not exist.
            DuplicateTabIdError: The supplied tab ID already exists.
        """
        if not await self.repository.active_group_exists(dto.group_id):
            raise InvalidGroupError(f"Group {dto.group_id!r} does not exist")
        position = (
            dto.position
            if dto.position is not None
            else await self.repository.next_position(dto.group_id)
        )
        tab = self.mapper.from_create_dto(
            dto,
            group_id=dto.group_id,
            position=position,
            tags=await self.repository.resolve_tags(dto.tags),
        )
        self.custom_properties.validate_patch(
            tab.custom_properties, await self.custom_properties.definitions()
        )
        try:
            await self.repository.add_tab(tab)
            job = await self.repository.add_preview_job(tab.id)
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise DuplicateTabIdError(f"Tab {tab.id!r} already exists") from error
        except Exception:
            await self.db.rollback()
            raise
        return await self._to_dto(tab), TabJobDTO(tab_id=tab.id, job_id=job.id)

    async def create_batch(
        self, dto: TabBatchCreateDTO
    ) -> tuple[builtins.list[TabDTO], builtins.list[TabJobDTO]]:
        """Create distinct Saved Tab occurrences in one transaction.

        The service validates every referenced Group before staging rows, assigns monotonically
        increasing default positions per membership scope, and creates one preview job per tab. A
        duplicate ID or any persistence failure rolls back the complete batch.

        Args:
            dto (TabBatchCreateDTO): Validated occurrences supplied in desired display order.

        Returns:
            tuple[builtins.list[TabDTO], builtins.list[TabJobDTO]]: Created tabs and their preview
                jobs in request order.

        Raises:
            DuplicateTabIdError: A supplied ID already exists or is repeated in the batch.
            InvalidGroupError: At least one requested non-null Group does not exist.
        """
        group_ids = {tab.group_id for tab in dto.tabs}
        for group_id in group_ids:
            if not await self.repository.active_group_exists(group_id):
                raise InvalidGroupError(f"Group {group_id!r} does not exist")

        next_positions: dict[str | None, float] = {}
        tabs: builtins.list[Tab] = []
        try:
            for item in dto.tabs:
                if item.position is None:
                    if item.group_id not in next_positions:
                        next_positions[item.group_id] = await self.repository.next_position(
                            item.group_id
                        )
                    position = next_positions[item.group_id]
                    next_positions[item.group_id] = position + 1
                else:
                    position = item.position
                tab = self.mapper.from_create_dto(
                    item,
                    group_id=item.group_id,
                    position=position,
                    tags=await self.repository.resolve_tags(item.tags),
                )
                self.custom_properties.validate_patch(
                    tab.custom_properties, await self.custom_properties.definitions()
                )
                tabs.append(tab)
            await self.repository.add_tabs(tabs)
            persisted_jobs = await self.repository.add_preview_jobs([tab.id for tab in tabs])
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise DuplicateTabIdError("A Saved Tab ID in the batch already exists") from error
        except Exception:
            await self.db.rollback()
            raise
        jobs = [
            TabJobDTO(tab_id=tab.id, job_id=job.id)
            for tab, job in zip(tabs, persisted_jobs, strict=True)
        ]
        return [await self._to_dto(tab) for tab in tabs], jobs

    async def update(self, tab_id: str, dto: TabUpdateDTO) -> TabDTO:
        """Patch a Saved Tab; archiving clears its Group, and restoring clears archive time.

        Args:
            tab_id (str): Stable identifier of the saved tab.
            dto (TabUpdateDTO): Validated request data for the operation.

        Returns:
            TabDTO: Current saved-tab fields, tags, and metadata.

        Raises:
            EmptyUpdateError: The patch contains no tab fields.
            InvalidGroupError: The destination group is absent or an archived tab is moved without restoration.
        """
        tab = await self._required_tab(tab_id)
        changes = self.mapper.to_update_dict(dto)
        if not changes:
            raise EmptyUpdateError("At least one tab field is required")
        if "group_id" in changes and not await self.repository.active_group_exists(
            changes["group_id"]
        ):
            raise InvalidGroupError(f"Group {changes['group_id']!r} does not exist")
        if "tags" in changes:
            changes["tags"] = await self.repository.resolve_tags(changes["tags"] or [])
        if "custom_properties" in changes:
            supplied = changes.pop("custom_properties") or {}
            await self.custom_properties.patch_tab(tab, supplied)
        restoring = changes.get("archived") is False
        if changes.get("archived") is True:
            changes["group_id"] = None
            changes["archived_at"] = utc_now()
        elif restoring:
            changes["archived_at"] = None
        elif tab.archived and changes.get("group_id") is not None:
            raise InvalidGroupError("Restore the tab before assigning it to a Group")
        changes["updated_at"] = utc_now()
        try:
            await self.repository.apply_changes(tab, changes)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return await self._to_dto(tab)

    async def delete(self, tab_id: str, hard: bool) -> TabDeleteResultDTO:
        """Archive a Saved Tab, or permanently delete one that is already archived.

        Args:
            tab_id (str): Stable identifier of the saved tab.
            hard (bool): Whether to permanently remove the archived tab.

        Returns:
            TabDeleteResultDTO: Tab ID and final archive or deletion state.

        Raises:
            ActiveTabDeleteError: Permanent deletion is requested before archiving the tab.
        """
        tab = await self._required_tab(tab_id)
        if hard and not tab.archived:
            raise ActiveTabDeleteError("Archive the tab before permanently deleting it")
        try:
            if hard:
                await self.repository.hard_delete(tab_id)
            else:
                await self.repository.archive(tab)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return TabDeleteResultDTO(id=tab_id, deleted_at=utc_now(), hard=hard)

    async def tag(
        self, tab_id: str, name: str, add: bool
    ) -> tuple[TabDTO, builtins.list[WarningDTO]]:
        """Attach or detach a tag; creating a missing tag adds a warning.

        Args:
            tab_id (str): Stable identifier of the saved tab.
            name (str): Name identifying the tag or other target record.
            add (bool): Whether to attach rather than remove the tag.

        Returns:
            tuple[TabDTO, builtins.list[WarningDTO]]: Updated tab and any tag warnings.
        """
        tab = await self._required_tab(tab_id)
        existing = next((tag for tag in tab.tags if tag.name.lower() == name.lower()), None)
        warnings: list[WarningDTO] = []
        if add and existing is None:
            known, created = await self.repository.get_or_create_tag(name)
            if created:
                warnings.append(
                    WarningDTO(
                        code="W_ORPHAN_TAG",
                        path="body.tagName",
                        message=f"Tag {name!r} was created automatically.",
                    )
                )
            await self.repository.attach_tag(tab, known)
        elif not add and existing is not None:
            await self.repository.detach_tag(tab, existing)
        await self.repository.apply_changes(tab, {"updated_at": utc_now()})
        await self.db.commit()
        return await self._to_dto(tab), warnings

    async def patch_custom_properties(self, tab_id: str, values: dict[str, object]) -> TabDTO:
        """Atomically merge a supplied subset of schema-defined values into one Saved Tab.

        Args:
            tab_id (str): Stable identity of the Saved Tab to update.
            values (dict[str, object]): Property subset validated against the current schema.

        Returns:
            TabDTO: Updated Saved Tab with resolved properties.

        Raises:
            TabNotFoundError: The requested Saved Tab does not exist.
        """
        tab = await self._required_tab(tab_id)
        try:
            await self.custom_properties.patch_tab(tab, values)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return await self._to_dto(tab)

    async def unset_custom_properties(self, tab_id: str, names: builtins.list[str]) -> TabDTO:
        """Atomically remove selected explicit overrides from one Saved Tab.

        Args:
            tab_id (str): Stable identity of the Saved Tab to update.
            names (list[str]): Stored property names to remove idempotently.

        Returns:
            TabDTO: Updated Saved Tab with defaults resolved for unset names.

        Raises:
            TabNotFoundError: The requested Saved Tab does not exist.
        """
        tab = await self._required_tab(tab_id)
        try:
            await self.custom_properties.unset_tab(tab, names)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return await self._to_dto(tab)
