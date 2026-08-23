"""Persistence operations for Saved Tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, asc, delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from lib.base_repository import BaseRepository
from lib.cursor import Cursor
from lib.time import utc_now
from models import Group, Job, Tab, Tag, Tombstone

from .dto import SortDirection, TabSortBy
from .visibility import TabVisibility, tabs_for_visibility


class TabRepository(BaseRepository[Tab]):
    """Persist Saved Tabs and directly related records."""

    model_type = Tab

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session."""
        super().__init__(session)
        self.session = session

    async def get(self, tab_id: str) -> Tab | None:  # type: ignore[override]
        """Load one Saved Tab with tags."""
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
        )

    async def list_tabs(
        self,
        *,
        group_id: str | None | object,
        category: str | None,
        tags_any: list[str],
        tags_all: list[str],
        search: str | None,
        sort_by: TabSortBy,
        sort_dir: SortDirection,
        limit: int,
        cursor: Cursor | None,
        visibility: TabVisibility,
        now: datetime,
    ) -> tuple[list[Tab], int]:
        """List filtered Saved Tabs using stable cursor pagination."""
        sort_column = {
            "position": Tab.position,
            "createdAt": Tab.created_at,
            "updatedAt": Tab.updated_at,
            "title": func.lower(Tab.title),
        }[sort_by]
        filters: list[Any] = [tabs_for_visibility(visibility, now)]
        if group_id != "all":
            filters.append(
                Tab.group_id.is_(None)
                if group_id in {None, "unassigned"}
                else Tab.group_id == group_id
            )
        if category is not None:
            filters.append(Tab.group_id.in_(select(Group.id).where(Group.category == category)))
        if search:
            pattern = f"%{search.lower()}%"
            filters.append(
                or_(
                    func.lower(Tab.title).like(pattern),
                    func.lower(Tab.url).like(pattern),
                    func.lower(Tab.note).like(pattern),
                    func.lower(Tab.agent_review).like(pattern),
                )
            )
        for name in tags_all:
            filters.append(Tab.tags.any(func.lower(Tag.name) == name.lower()))
        if tags_any:
            filters.append(
                Tab.tags.any(func.lower(Tag.name).in_([name.lower() for name in tags_any]))
            )
        total = int(await self.session.scalar(select(func.count(Tab.id)).where(*filters)) or 0)
        if cursor:
            cursor_value = cursor.value
            if sort_by in {"createdAt", "updatedAt"} and isinstance(cursor_value, str):
                cursor_value = datetime.fromisoformat(cursor_value.replace("Z", "+00:00"))
            compare = (
                sort_column > cursor_value if sort_dir == "asc" else sort_column < cursor_value
            )
            filters.append(
                or_(
                    compare,
                    and_(
                        sort_column == cursor_value,
                        Tab.id > cursor.id if sort_dir == "asc" else Tab.id < cursor.id,
                    ),
                )
            )
        ordering = asc if sort_dir == "asc" else desc
        rows = list(
            (
                await self.session.scalars(
                    select(Tab)
                    .where(*filters)
                    .options(selectinload(Tab.tags))
                    .order_by(ordering(sort_column), ordering(Tab.id))
                    .limit(limit + 1)
                )
            ).unique()
        )
        return rows, total

    async def active_group_exists(self, group_id: str | None) -> bool:
        """Return whether a nullable Group target is valid."""
        if group_id is None:
            return True
        return bool(await self.session.scalar(select(Group.id).where(Group.id == group_id)))

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags."""
        result: list[Tag] = []
        for raw in dict.fromkeys(name.strip() for name in names if name.strip()):
            tag, _created = await self.get_or_create_tag(raw)
            result.append(tag)
        return result

    async def get_or_create_tag(self, name: str) -> tuple[Tag, bool]:
        """Load a tag case-insensitively or create it."""
        tag = await self.session.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is not None:
            return tag, False
        tag = Tag(name=name, description=None)
        self.session.add(tag)
        await self.session.flush()
        return tag, True

    async def next_position(self, group_id: str | None) -> float:
        """Find the next display position in a Group or Unassigned."""
        condition = Tab.group_id.is_(None) if group_id is None else Tab.group_id == group_id
        maximum = await self.session.scalar(
            select(func.coalesce(func.max(Tab.position), -1)).where(
                condition, Tab.archived.is_(False)
            )
        )
        return float(maximum if maximum is not None else -1) + 1

    async def add_tab(self, tab: Tab) -> Tab:
        """Persist one Saved Tab occurrence."""
        self.session.add(tab)
        await self.session.flush()
        return tab

    async def add_preview_job(self, tab_id: str) -> Job:
        """Create a preview-capture job for a Saved Tab."""
        job = Job(kind="preview_capture", target_id=tab_id)
        self.session.add(job)
        await self.session.flush()
        return job

    async def apply_changes(self, tab: Tab, changes: dict[str, object]) -> None:
        """Apply mapped field values to a Saved Tab."""
        for key, value in changes.items():
            setattr(tab, key, value)

    async def attach_tag(self, tab: Tab, tag: Tag) -> None:
        """Attach a loaded tag to a Saved Tab."""
        tab.tags.append(tag)

    async def detach_tag(self, tab: Tab, tag: Tag) -> None:
        """Detach a loaded tag from a Saved Tab."""
        tab.tags.remove(tag)

    async def hard_delete(self, tab_id: str) -> None:
        """Permanently delete a Saved Tab and record its tombstone."""
        await self.session.execute(delete(Tab).where(Tab.id == tab_id))
        self.session.add(Tombstone(entity_type="tab", entity_id=tab_id))

    async def archive(self, tab: Tab) -> None:
        """Archive and Unassign a Saved Tab."""
        now = utc_now()
        tab.group_id = None
        tab.archived = True
        tab.archived_at = now
        tab.updated_at = now
