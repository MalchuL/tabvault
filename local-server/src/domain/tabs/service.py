from __future__ import annotations

from builtins import list as list_type
from collections.abc import Sequence
from typing import Any

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.cursor import decode_cursor, encode_cursor
from lib.responses import issue
from lib.time import utc_now
from lib.url import normalize_url
from models import Group, Job, Tab, Tag, Tombstone

from .dto import TabBatchCreateDTO, TabCreateDTO, TabMoveDTO, TabRestoreDTO, TabUpdateDTO
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
    def __init__(self, db: AsyncSession, repository: TabRepository) -> None:
        self.db = db
        self.repository = repository
        self.mapper = TabMapper()

    async def _group_exists(self, group_id: str | None) -> bool:
        if group_id in {None, "", "inbox"}:
            return True
        return bool(
            await self.db.scalar(
                select(Group.id).where(Group.id == group_id, Group.archived.is_(False))
            )
        )

    async def _tags(self, names: list[str]) -> list[Tag]:
        result: list[Tag] = []
        for raw in dict.fromkeys(name.strip() for name in names if name.strip()):
            tag = await self.db.scalar(select(Tag).where(func.lower(Tag.name) == raw.lower()))
            if tag is None:
                tag = Tag(name=raw, description=None)
                self.db.add(tag)
                await self.db.flush()
            result.append(tag)
        return result

    async def list(self, **options: Any) -> dict[str, Any]:
        limit = min(max(int(options.get("limit", 50)), 1), 200)
        sort_by = options.get("sort_by", "position")
        try:
            cursor = decode_cursor(options["cursor"], sort_by) if options.get("cursor") else None
        except ValueError as error:
            raise InvalidCursorError(str(error)) from error
        rows, total = await self.repository.list_tabs(
            group_id=options.get("group_id", "all"),
            group_ids=options.get("group_ids"),
            tags_any=options.get("tags_any", []),
            tags_all=options.get("tags_all", []),
            search=options.get("search"),
            sort_by=sort_by,
            sort_dir=options.get("sort_dir", "asc"),
            limit=limit,
            cursor=cursor,
            include_archived=options.get("include_archived", False),
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        data = [
            self._project(
                self.mapper.to_dto(row).model_dump(mode="json", by_alias=True),
                options.get("fields", "full"),
            )
            for row in rows
        ]
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
        warnings = []
        if int(options.get("requested_limit", limit)) > 200:
            warnings.append(
                {
                    "code": "W_LIMIT_CAPPED",
                    "path": "query.limit",
                    "message": "limit was capped at 200",
                }
            )
        return {
            "tabs": data,
            "meta": {"nextCursor": next_cursor, "hasMore": has_more, "totalCount": total},
            "warnings": warnings,
        }

    @staticmethod
    def _project(tab: dict[str, Any], fields: str) -> dict[str, Any]:
        if fields == "full":
            return tab
        allowed = (
            {"id", "url", "title", "favicon", "groupId", "tags"}
            if fields == "minimal"
            else set(fields.split(","))
        )
        return {key: value for key, value in tab.items() if key in allowed}

    async def get(self, tab_id: str) -> dict[str, Any]:
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return self.mapper.to_dto(tab).model_dump(mode="json", by_alias=True)

    async def create_batch(
        self, body: TabBatchCreateDTO, atomic: bool, *, commit: bool = True
    ) -> tuple[dict[str, Any], int]:
        valid: list[tuple[int, TabCreateDTO]] = []
        errors: list[dict[str, Any]] = []
        for index, raw in enumerate(body.tabs):
            try:
                dto = TabCreateDTO.model_validate(raw)
                normalize_url(dto.url)
                if not await self._group_exists(dto.group_id):
                    raise InvalidGroupError(f"Group {dto.group_id!r} does not exist")
                valid.append((index, dto))
            except ValidationError as error:
                for validation_item in error.errors(include_url=False):
                    path = ".".join(str(part) for part in validation_item["loc"])
                    errors.append(
                        issue(
                            "E_INVALID_FIELD",
                            f"body.tabs[{index}].{path}",
                            validation_item["type"],
                            validation_item.get("input"),
                            validation_item["msg"],
                            422,
                        )
                    )
            except ValueError:
                errors.append(
                    issue(
                        "E_INVALID_URL",
                        f"body.tabs[{index}].url",
                        "absolute http/https URL",
                        raw.get("url"),
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
                        raw.get("groupId"),
                        str(error),
                        error.status_code,
                    )
                )
        if errors and atomic:
            return {"created": [], "skipped": [], "errors": errors, "jobs": []}, 422

        created: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        jobs: list[dict[str, str]] = []
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
                        duplicate.tags = await self._tags(
                            [*[tag.name for tag in duplicate.tags], *dto.tags]
                        )
                        if dto.title:
                            duplicate.title = dto.title
                        if dto.note:
                            duplicate.note = dto.note
                        duplicate.updated_at = utc_now()
                    if duplicate.archived:
                        duplicate.archived = False
                        duplicate.archived_at = None
                    tab_item: dict[str, Any] = self.mapper.to_dto(duplicate).model_dump(
                        mode="json", by_alias=True
                    )
                    tab_item["wasDuplicate"] = True
                    created.append(tab_item)
                    skipped.append(
                        {"url": dto.url, "existingId": duplicate.id, "reason": "duplicate_url"}
                    )
                    continue
                group_id = None if dto.group_id in {None, "", "inbox"} else dto.group_id
                position = dto.position
                if position is None:
                    position = (
                        float(
                            await self.db.scalar(
                                select(func.coalesce(func.max(Tab.position), -1)).where(
                                    Tab.group_id == group_id
                                )
                            )
                            or -1
                        )
                        + 1
                    )
                values: dict[str, Any] = dict(
                    url=normalized,
                    normalized_url=normalized,
                    title=dto.title or normalized,
                    note=dto.note,
                    group_id=group_id,
                    position=position,
                    archived=dto.archived,
                    archived_at=dto.archived_at,
                    created_at=dto.created_at or utc_now(),
                    updated_at=dto.updated_at or utc_now(),
                    tags=await self._tags(dto.tags),
                )
                if dto.id is not None:
                    values["id"] = dto.id
                tab = Tab(**values)
                self.db.add(tab)
                await self.db.flush()
                job = Job(kind="preview_capture", target_id=tab.id)
                self.db.add(job)
                await self.db.flush()
                tab_item = self.mapper.to_dto(tab).model_dump(mode="json", by_alias=True)
                tab_item["wasDuplicate"] = False
                created.append(tab_item)
                jobs.append({"tabId": tab.id, "jobId": job.id})
            if commit:
                await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        status = 207 if errors and created else 422 if errors else 201
        return {"created": created, "skipped": skipped, "errors": errors, "jobs": jobs}, status

    async def update(self, tab_id: str, dto: TabUpdateDTO) -> dict[str, Any]:
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        changes = dto.model_dump(exclude_unset=True)
        if not changes:
            raise EmptyUpdateError("At least one tab field is required")
        if "group_id" in changes and not await self._group_exists(changes["group_id"]):
            raise InvalidGroupError(f"Group {changes['group_id']!r} does not exist")
        if "tags" in changes:
            tab.tags = await self._tags(changes.pop("tags") or [])
        for key, value in changes.items():
            if key == "group_id" and value in {"", "inbox"}:
                value = None
            setattr(tab, key, value)
        if changes.get("archived") is True and not tab.archived_at:
            tab.archived_at = utc_now()
        if changes.get("archived") is False:
            tab.archived_at = None
        tab.updated_at = utc_now()
        await self.db.commit()
        return self.mapper.to_dto(tab).model_dump(mode="json", by_alias=True)

    async def delete(self, tab_id: str, hard: bool) -> dict[str, Any]:
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        if hard:
            if not tab.archived:
                raise ActiveTabDeleteError("Archive the tab before permanently deleting it")
            await self.db.execute(delete(Tab).where(Tab.id == tab_id))
            self.db.add(Tombstone(entity_type="tab", entity_id=tab_id))
        else:
            tab.archived = True
            tab.archived_at = utc_now()
            tab.updated_at = utc_now()
        await self.db.commit()
        return {
            "id": tab_id,
            "deletedAt": utc_now().isoformat().replace("+00:00", "Z"),
            "hard": hard,
        }

    async def batch_delete(self, ids: Sequence[str], hard: bool) -> dict[str, Any]:
        deleted_ids: list_type[str] = []
        missing: list_type[str] = []
        for tab_id in ids:
            try:
                await self.delete(tab_id, hard)
                deleted_ids.append(tab_id)
            except TabNotFoundError:
                missing.append(tab_id)
        return {"deleted": deleted_ids, "notFound": missing}

    async def move(self, tab_id: str, dto: TabMoveDTO) -> dict[str, Any]:
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
                for offset, row in enumerate(rows):
                    row.position = float(offset)
                before = rows[index - 1].position if index else None
                after = rows[index].position if index < len(rows) else None
                position = (
                    (before + after) / 2
                    if before is not None and after is not None
                    else (-1.0 if before is None else before + 1)
                )
        tab.group_id = target
        tab.position = position
        tab.updated_at = utc_now()
        await self.db.commit()
        return self.mapper.to_dto(tab).model_dump(mode="json", by_alias=True)

    async def tag(
        self, tab_id: str, name: str, add: bool
    ) -> tuple[dict[str, Any], list_type[dict[str, Any]]]:
        tab = await self.repository.get(tab_id)
        if tab is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        existing = next((tag for tag in tab.tags if tag.name.lower() == name.lower()), None)
        warnings: list_type[dict[str, Any]] = []
        if add and existing is None:
            known = await self.db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
            if known is None:
                known = Tag(name=name, description=None)
                self.db.add(known)
                warnings.append(
                    {
                        "code": "W_ORPHAN_TAG",
                        "path": "body.tagName",
                        "message": f"Tag {name!r} was created automatically.",
                    }
                )
            tab.tags.append(known)
        elif not add and existing is not None:
            tab.tags.remove(existing)
        tab.updated_at = utc_now()
        await self.db.commit()
        return self.mapper.to_dto(tab).model_dump(mode="json", by_alias=True), warnings

    async def restore(self, items: Sequence[TabRestoreDTO]) -> dict[str, int]:
        restored = 0
        for dto in items:
            tombstone = await self.db.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == "tab", Tombstone.entity_id == dto.id
                )
            )
            if tombstone:
                continue
            tab = await self.repository.get(dto.id)
            if tab is None:
                result, _ = await self.create_batch(
                    TabBatchCreateDTO(
                        tabs=[dto.model_dump(by_alias=True)],
                        dedupe=False,
                        dedupe_strategy="createAnyway",
                    ),
                    atomic=True,
                    commit=False,
                )
                restored += len(result["created"])
            elif dto.updated_at and dto.updated_at > tab.updated_at.replace(
                tzinfo=tab.updated_at.tzinfo or dto.updated_at.tzinfo
            ):
                tab.title = dto.title or tab.title
                tab.note = dto.note
                tab.group_id = dto.group_id
                tab.position = dto.position or 0
                tab.archived = dto.archived
                tab.archived_at = dto.archived_at
                tab.tags = await self._tags(dto.tags)
                restored += 1
        await self.db.commit()
        return {"restored": restored}
