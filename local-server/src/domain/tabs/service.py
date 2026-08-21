"""Tab application service and transaction boundaries."""

from __future__ import annotations

import builtins
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from lib.cursor import decode_cursor, encode_cursor
from lib.responses import IssueDTO, WarningDTO, issue
from lib.time import utc_now
from lib.url import normalize_url
from models import Tag

from .dto import (
    TabBatchCreateDTO,
    TabBatchDeleteResultDTO,
    TabCreatedDTO,
    TabCreateDTO,
    TabCreateResultDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabJobDTO,
    TabListMetaDTO,
    TabListOptionsDTO,
    TabListResultDTO,
    TabMoveDTO,
    TabRestoreDTO,
    TabRestoreResultDTO,
    TabSkippedDTO,
    TabUpdateDTO,
)
from .error import (
    ActiveTabDeleteError,
    EmptyUpdateError,
    InvalidCursorError,
    InvalidGroupError,
    TabNotFoundError,
)
from .mapper import TabMapper
from .repository import TabRepository


class TabService:
    """Orchestrate tab use cases while owning transactions."""

    def __init__(self, db: AsyncSession, repository: TabRepository) -> None:
        """Initialize the service.

        Args:
            db: Request-scoped session used only for transactions.
            repository: Tab persistence operations.
        """
        self.db = db
        self.repository = repository
        self.mapper = TabMapper()

    async def _group_exists(self, group_id: str | None) -> bool:
        """Check whether a requested group target is active."""
        return await self.repository.active_group_exists(group_id)

    async def _tags(self, names: list[str]) -> list[Tag]:
        """Resolve tag models through the repository."""
        return await self.repository.resolve_tags(names)

    async def list(self, options: TabListOptionsDTO) -> TabListResultDTO:
        """List tabs using validated filters and cursor pagination.

        Args:
            options: Validated list filters.

        Returns:
            Projected tabs with pagination metadata and warnings.

        Raises:
            InvalidCursorError: If the cursor cannot be decoded.
        """
        limit = min(max(options.limit, 1), 200)
        sort_by = options.sort_by
        try:
            cursor = decode_cursor(options.cursor, sort_by) if options.cursor else None
        except ValueError as error:
            raise InvalidCursorError(str(error)) from error
        rows, total = await self.repository.list_tabs(
            group_id=options.group_id,
            group_ids=options.group_ids,
            tags_any=options.tags_any,
            tags_all=options.tags_all,
            search=options.search,
            sort_by=sort_by,
            sort_dir=options.sort_dir,
            limit=limit,
            cursor=cursor,
            include_archived=options.include_archived,
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        data = [self.mapper.to_projection(row, options.fields) for row in rows]
        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            value = {
                "position": last.position,
                "createdAt": last.created_at.isoformat(),
                "updatedAt": last.updated_at.isoformat(),
                "title": last.title.lower(),
            }[sort_by]
            next_cursor = encode_cursor(sort_by, value, last.id)
        warnings: list[WarningDTO] = []
        if options.requested_limit > 200:
            warnings.append(
                WarningDTO(
                    code="W_LIMIT_CAPPED",
                    path="query.limit",
                    message="limit was capped at 200",
                )
            )
        return TabListResultDTO(
            tabs=data,
            meta=TabListMetaDTO(
                next_cursor=next_cursor,
                has_more=has_more,
                total_count=total,
            ),
            warnings=warnings,
        )

    async def get(self, tab_id: str) -> TabDTO:
        """Return one tab by ID."""
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return self.mapper.to_dto(tab)

    async def create_batch(
        self, body: TabBatchCreateDTO, atomic: bool, *, commit: bool = True
    ) -> tuple[TabCreateResultDTO, int]:
        """Create a batch of tabs and optionally commit it atomically."""
        valid: list[tuple[int, TabCreateDTO]] = []
        errors: list[IssueDTO] = []
        for index, dto in enumerate(body.tabs):
            try:
                normalize_url(dto.url)
                if not await self._group_exists(dto.group_id):
                    raise InvalidGroupError(f"Group {dto.group_id!r} does not exist")
                valid.append((index, dto))
            except ValueError:
                errors.append(
                    issue(
                        "E_INVALID_URL",
                        f"body.tabs[{index}].url",
                        "absolute http/https URL",
                        dto.url,
                        "URL must start with http:// or https://.",
                        422,
                    )
                )
            except InvalidGroupError as error:
                errors.append(
                    issue(
                        error.code,
                        f"body.tabs[{index}].groupId",
                        "existing active group",
                        dto.group_id,
                        str(error),
                        error.status_code,
                    )
                )
        if errors and atomic:
            return TabCreateResultDTO(created=[], skipped=[], errors=errors, jobs=[]), 422

        created: list[TabCreatedDTO] = []
        skipped: list[TabSkippedDTO] = []
        jobs: list[TabJobDTO] = []
        try:
            for _index, dto in valid:
                normalized = normalize_url(dto.url)
                duplicate = (
                    await self.repository.find_url(normalized)
                    if body.dedupe and body.dedupe_strategy != "createAnyway"
                    else None
                )
                if duplicate:
                    if body.dedupe_strategy == "merge":
                        await self.repository.apply_changes(
                            duplicate,
                            self.mapper.to_merge_dict(
                                dto,
                                await self._tags(
                                    [*[tag.name for tag in duplicate.tags], *dto.tags]
                                ),
                            ),
                        )
                    if duplicate.archived:
                        await self.repository.apply_changes(
                            duplicate,
                            {"archived": False, "archived_at": None},
                        )
                    created.append(self.mapper.to_created_dto(duplicate, True))
                    skipped.append(
                        TabSkippedDTO(
                            url=dto.url,
                            existing_id=duplicate.id,
                            reason="duplicate_url",
                        )
                    )
                    continue
                group_id = None if dto.group_id in {None, "", "inbox"} else dto.group_id
                position = dto.position
                if position is None:
                    position = await self.repository.next_position(group_id)
                tab = self.mapper.from_create_dto(
                    dto,
                    normalized_url=normalized,
                    group_id=group_id,
                    position=position,
                    tags=await self._tags(dto.tags),
                )
                await self.repository.add_tab(tab)
                job = await self.repository.add_preview_job(tab.id)
                created.append(self.mapper.to_created_dto(tab, False))
                jobs.append(TabJobDTO(tab_id=tab.id, job_id=job.id))
            if commit:
                await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        status = 207 if errors and created else 422 if errors else 201
        return TabCreateResultDTO(
            created=created,
            skipped=skipped,
            errors=errors,
            jobs=jobs,
        ), status

    async def update(self, tab_id: str, dto: TabUpdateDTO) -> TabDTO:
        """Update one tab from a partial DTO."""
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        changes = self.mapper.to_update_dict(dto)
        if not changes:
            raise EmptyUpdateError("At least one tab field is required")
        if "group_id" in changes and not await self._group_exists(changes["group_id"]):
            raise InvalidGroupError(f"Group {changes['group_id']!r} does not exist")
        if "tags" in changes:
            changes["tags"] = await self._tags(changes["tags"] or [])
        if changes.get("group_id") in {"", "inbox"}:
            changes["group_id"] = None
        if changes.get("archived") is True and not tab.archived_at:
            changes["archived_at"] = utc_now()
        if changes.get("archived") is False:
            changes["archived_at"] = None
        changes["updated_at"] = utc_now()
        await self.repository.apply_changes(tab, changes)
        await self.db.commit()
        return self.mapper.to_dto(tab)

    async def delete(self, tab_id: str, hard: bool, *, commit: bool = True) -> TabDeleteResultDTO:
        """Archive or permanently delete one tab."""
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        if hard:
            if not tab.archived:
                raise ActiveTabDeleteError("Archive the tab before permanently deleting it")
            await self.repository.hard_delete(tab_id)
        else:
            await self.repository.archive(tab)
        if commit:
            await self.db.commit()
        return TabDeleteResultDTO(id=tab_id, deleted_at=utc_now(), hard=hard)

    async def batch_delete(self, ids: Sequence[str], hard: bool) -> TabBatchDeleteResultDTO:
        """Delete multiple tabs in one transaction."""
        deleted_ids: list[str] = []
        missing: list[str] = []
        try:
            for tab_id in ids:
                try:
                    await self.delete(tab_id, hard, commit=False)
                    deleted_ids.append(tab_id)
                except TabNotFoundError:
                    missing.append(tab_id)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return TabBatchDeleteResultDTO(deleted=deleted_ids, not_found=missing)

    async def move(self, tab_id: str, dto: TabMoveDTO) -> TabDTO:
        """Move one tab to a calculated position."""
        if not await self._group_exists(dto.target_group_id):
            raise InvalidGroupError(f"Group {dto.target_group_id!r} does not exist")
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        target = None if dto.target_group_id in {None, "", "inbox"} else dto.target_group_id
        rows = [row for row in await self.repository.group_rows(target) if row.id != tab_id]
        index = len(rows) if dto.position is None else min(dto.position, len(rows))
        before = rows[index - 1].position if index else None
        after = rows[index].position if index < len(rows) else None
        if before is None and after is None:
            position = 0.0
        elif before is None:
            assert after is not None
            position = after - 1.0
        elif after is None:
            position = before + 1.0
        else:
            position = (before + after) / 2
            if position in {before, after}:
                await self.repository.renumber(rows)
                before = rows[index - 1].position if index else None
                after = rows[index].position if index < len(rows) else None
                position = (
                    (before + after) / 2
                    if before is not None and after is not None
                    else (-1.0 if before is None else before + 1)
                )
        await self.repository.apply_changes(tab, self.mapper.to_move_dict(dto, position=position))
        await self.db.commit()
        return self.mapper.to_dto(tab)

    async def tag(
        self, tab_id: str, name: str, add: bool
    ) -> tuple[TabDTO, builtins.list[WarningDTO]]:
        """Attach or detach a tag from a tab."""
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

    async def restore(self, items: Sequence[TabRestoreDTO]) -> TabRestoreResultDTO:
        """Restore newer synchronized tabs unless tombstoned."""
        restored = 0
        for dto in items:
            if await self.repository.tombstone_exists(dto.id):
                continue
            tab = await self.repository.get(dto.id)
            if tab is None:
                result, _ = await self.create_batch(
                    TabBatchCreateDTO(
                        tabs=[dto],
                        dedupe=False,
                        dedupe_strategy="createAnyway",
                    ),
                    atomic=True,
                    commit=False,
                )
                restored += len(result.created)
            elif dto.updated_at and dto.updated_at > tab.updated_at.replace(
                tzinfo=tab.updated_at.tzinfo or dto.updated_at.tzinfo
            ):
                await self.repository.apply_changes(
                    tab,
                    self.mapper.to_restore_dict(dto, await self._tags(dto.tags)),
                )
                restored += 1
        await self.db.commit()
        return TabRestoreResultDTO(restored=restored)
