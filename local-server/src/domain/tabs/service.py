"""Saved Tab application service and transaction boundaries."""

from __future__ import annotations

import builtins

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from lib.pagination import ListOptions
from lib.responses import WarningDTO
from lib.time import utc_now
from models import Tab, Tag

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
    """Orchestrate Saved Tab use cases.

    This application-layer operation coordinates domain rules and persistence, then maps loaded ORM
    state into transport DTOs. Callers do not need to know how records are queried or related data
    is assembled.
    """

    def __init__(self, db: AsyncSession, repository: TabRepository) -> None:
        """Initialize the service and persistence dependency.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session used by this operation.
            repository (TabRepository): Persistence adapter used to load and mutate domain records.
        """
        self.db = db
        self.repository = repository
        self.mapper = TabMapper()

    async def _tags(self, names: list[str]) -> list[Tag]:
        """Resolve caller-supplied tag names into persistent Tag records.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            names (list[str]): Names value consumed by this operation.

        Returns:
            list[Tag]: Result produced by the operation described above.
        """
        return await self.repository.resolve_tags(names)

    async def list(
        self, options: TabListOptionsDTO, list_options: ListOptions
    ) -> TabListResponseDTO:
        """List Saved Tabs using validated filters and database pagination.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            options (TabListOptionsDTO): Options value consumed by this operation.
            list_options (ListOptions): Validated page size and row offset.

        Returns:
            TabListResponseDTO: Projected rows and pagination metadata.
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
        return TabListResponseDTO.from_page(
            page.map(lambda row: self.mapper.to_projection(row, options.fields))
        )

    async def get(self, tab_id: str) -> TabDTO:
        """Return one Saved Tab.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            TabDTO: Result produced by the operation described above.

        Raises:
            TabNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return self.mapper.to_dto(tab)

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
        """Create one occurrence without URL lookup or deduplication.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            dto (TabCreateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            tuple[TabDTO, TabJobDTO]: Result produced by the operation described above.

        Raises:
            DuplicateTabIdError: Propagated when its documented validation or operation condition
                occurs.
            InvalidGroupError: Propagated when its documented validation or operation condition
                occurs.
        """
        if not await self.repository.active_group_exists(dto.group_id):
            raise InvalidGroupError(f"Group {dto.group_id!r} does not exist")
        position = (
            dto.position
            if dto.position is not None
            else await self.repository.next_position(dto.group_id)
        )
        tab = self.mapper.from_create_dto(
            dto, group_id=dto.group_id, position=position, tags=await self._tags(dto.tags)
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
        return self.mapper.to_dto(tab), TabJobDTO(tab_id=tab.id, job_id=job.id)

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
                    tags=await self._tags(item.tags),
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
        return [self.mapper.to_dto(tab) for tab in tabs], jobs

    async def update(self, tab_id: str, dto: TabUpdateDTO) -> TabDTO:
        """Patch one Saved Tab while preserving archive invariants.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.
            dto (TabUpdateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            TabDTO: Result produced by the operation described above.

        Raises:
            EmptyUpdateError: Propagated when its documented validation or operation condition
                occurs.
            InvalidGroupError: Propagated when its documented validation or operation condition
                occurs.
            TabNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        changes = self.mapper.to_update_dict(dto)
        if not changes:
            raise EmptyUpdateError("At least one tab field is required")
        if "group_id" in changes and not await self.repository.active_group_exists(
            changes["group_id"]
        ):
            raise InvalidGroupError(f"Group {changes['group_id']!r} does not exist")
        if "tags" in changes:
            changes["tags"] = await self._tags(changes["tags"] or [])
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
        return self.mapper.to_dto(tab)

    async def delete(self, tab_id: str, hard: bool) -> TabDeleteResultDTO:
        """Archive one Saved Tab or permanently delete an archived one.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.
            hard (bool): Whether to permanently delete an already archived record instead of
                archiving it.

        Returns:
            TabDeleteResultDTO: Result produced by the operation described above.

        Raises:
            ActiveTabDeleteError: Propagated when its documented validation or operation condition
                occurs.
            TabNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
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
        """Attach or detach one tag.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.
            name (str): Human-readable name used by the operation.
            add (bool): Whether the relation is attached; false requests detachment.

        Returns:
            tuple[TabDTO, builtins.list[WarningDTO]]: Result produced by the operation described
                above.

        Raises:
            TabNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
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
        return self.mapper.to_dto(tab), warnings
