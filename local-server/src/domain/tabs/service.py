"""Saved Tab application service and transaction boundaries."""

from __future__ import annotations

import builtins

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from lib.cursor import decode_cursor, encode_cursor
from lib.responses import WarningDTO
from lib.time import utc_now
from models import Tag

from .dto import (
    TabCreateDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabJobDTO,
    TabListMetaDTO,
    TabListOptionsDTO,
    TabListResultDTO,
    TabUpdateDTO,
)
from .error import (
    ActiveTabDeleteError,
    DuplicateTabIdError,
    EmptyUpdateError,
    InvalidCursorError,
    InvalidGroupError,
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

    async def list(self, options: TabListOptionsDTO) -> TabListResultDTO:
        """List Saved Tabs using validated filters and cursor pagination.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            options (TabListOptionsDTO): Options value consumed by this operation.

        Returns:
            TabListResultDTO: Result produced by the operation described above.

        Raises:
            InvalidCursorError: Propagated when its documented validation or operation condition
                occurs.
        """
        limit = min(max(options.limit, 1), 200)
        now = utc_now()
        try:
            cursor = decode_cursor(options.cursor, options.sort_by) if options.cursor else None
        except ValueError as error:
            raise InvalidCursorError(str(error)) from error
        rows, total = await self.repository.list_tabs(
            group_id=options.group_id,
            category=options.category,
            tags_any=options.tags_any,
            tags_all=options.tags_all,
            search=options.search,
            sort_by=options.sort_by,
            sort_dir=options.sort_dir,
            limit=limit,
            cursor=cursor,
            visibility=options.visibility,
            now=now,
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            value = {
                "position": last.position,
                "createdAt": last.created_at.isoformat(),
                "updatedAt": last.updated_at.isoformat(),
                "title": last.title.lower(),
            }[options.sort_by]
            next_cursor = encode_cursor(options.sort_by, value, last.id)
        warnings = []
        if options.requested_limit > 200:
            warnings.append(
                WarningDTO(
                    code="W_LIMIT_CAPPED",
                    path="query.limit",
                    message="limit was capped at 200",
                )
            )
        return TabListResultDTO(
            tabs=[self.mapper.to_projection(row, options.fields) for row in rows],
            meta=TabListMetaDTO(next_cursor=next_cursor, has_more=has_more, total_count=total),
            warnings=warnings,
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
