"""Persistence operations for tab use cases."""

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


class TabRepository(BaseRepository[Tab]):
    """Persist tabs and directly related tab-use-case records."""

    model_type = Tab

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository.

        Args:
            session: Request-scoped database session.
        """
        super().__init__(session)
        self.session = session

    async def get(self, tab_id: str) -> Tab | None:  # type: ignore[override]
        """Load one tab with its tags.

        Args:
            tab_id: Tab identifier.

        Returns:
            The tab row, or ``None``.
        """
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
        )

    async def find_url(self, normalized_url: str) -> Tab | None:
        """Find the oldest tab matching a normalized URL.

        Args:
            normalized_url: Canonical URL.

        Returns:
            A matching tab, or ``None``.
        """
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tab)
            .where(Tab.normalized_url == normalized_url)
            .order_by(Tab.created_at, Tab.id)
            .options(selectinload(Tab.tags))
        )

    async def list_tabs(
        self,
        *,
        group_id: str | None | object,
        group_ids: set[str] | None,
        tags_any: list[str],
        tags_all: list[str],
        search: str | None,
        sort_by: TabSortBy,
        sort_dir: SortDirection,
        limit: int,
        cursor: Cursor | None,
        include_archived: bool,
    ) -> tuple[list[Tab], int]:
        """List filtered tabs using cursor pagination.

        Args:
            group_id: Group filter or an inbox/all sentinel.
            group_ids: Optional explicit group set.
            tags_any: Tags matched with OR semantics.
            tags_all: Tags matched with AND semantics.
            search: Optional text search.
            sort_by: Stable sort key.
            sort_dir: Sort direction.
            limit: Page size before the extra lookahead row.
            cursor: Decoded cursor position.
            include_archived: Whether archived rows are visible.

        Returns:
            Loaded rows and total filtered count.
        """
        sort_column = {
            "position": Tab.position,
            "createdAt": Tab.created_at,
            "updatedAt": Tab.updated_at,
            "title": func.lower(Tab.title),
        }[sort_by]
        filters: list[Any] = []
        if not include_archived:
            filters.append(Tab.archived.is_(False))
        if group_ids is not None:
            filters.append(Tab.group_id.in_(group_ids))
        elif group_id != "all":
            filters.append(
                Tab.group_id.is_(None) if group_id == "inbox" else Tab.group_id == group_id
            )
        if search:
            pattern = f"%{search.lower()}%"
            filters.append(
                or_(
                    func.lower(Tab.title).like(pattern),
                    func.lower(Tab.url).like(pattern),
                    func.lower(Tab.note).like(pattern),
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

    async def group_rows(self, group_id: str | None) -> list[Tab]:
        """Load active tabs in one group in display order.

        Args:
            group_id: Nullable target group.

        Returns:
            Ordered active tab rows.
        """
        return list(
            (
                await self.session.scalars(
                    select(Tab)
                    .where(Tab.group_id.is_(None) if group_id is None else Tab.group_id == group_id)
                    .where(Tab.archived.is_(False))
                    .options(selectinload(Tab.tags))
                    .order_by(Tab.position, Tab.id)
                )
            ).unique()
        )

    async def active_group_exists(self, group_id: str | None) -> bool:
        """Check whether a normalized group target is available.

        Args:
            group_id: Nullable group identifier.

        Returns:
            ``True`` for inbox or an active group.
        """
        if group_id in {None, "", "inbox"}:
            return True
        return bool(
            await self.session.scalar(
                select(Group.id).where(Group.id == group_id, Group.archived.is_(False))
            )
        )

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags.

        Args:
            names: Requested tag names.

        Returns:
            Deduplicated tag rows in request order.
        """
        result: list[Tag] = []
        for raw in dict.fromkeys(name.strip() for name in names if name.strip()):
            tag, _created = await self.get_or_create_tag(raw)
            result.append(tag)
        return result

    async def get_or_create_tag(self, name: str) -> tuple[Tag, bool]:
        """Load a tag case-insensitively or create it.

        Args:
            name: Requested tag name.

        Returns:
            Tag row and whether it was newly created.
        """
        tag = await self.session.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is not None:
            return tag, False
        tag = Tag(name=name, description=None)
        self.session.add(tag)
        await self.session.flush()
        return tag, True

    async def next_position(self, group_id: str | None) -> float:
        """Find the next display position in a group.

        Args:
            group_id: Nullable group identifier.

        Returns:
            Position after the current maximum.
        """
        maximum = await self.session.scalar(
            select(func.coalesce(func.max(Tab.position), -1)).where(Tab.group_id == group_id)
        )
        return float(maximum if maximum is not None else -1) + 1

    async def add_tab(self, tab: Tab) -> Tab:
        """Persist a new tab and populate generated fields.

        Args:
            tab: Unpersisted tab model.

        Returns:
            Persisted tab model.
        """
        self.session.add(tab)
        await self.session.flush()
        return tab

    async def add_preview_job(self, tab_id: str) -> Job:
        """Create a preview-capture job for a tab.

        Args:
            tab_id: Target tab identifier.

        Returns:
            Persisted job row.
        """
        job = Job(kind="preview_capture", target_id=tab_id)
        self.session.add(job)
        await self.session.flush()
        return job

    async def apply_changes(self, tab: Tab, changes: dict[str, object]) -> None:
        """Apply mapped field changes to a tab.

        Args:
            tab: Tab row to mutate.
            changes: Snake-case ORM field values.
        """
        for key, value in changes.items():
            setattr(tab, key, value)

    async def renumber(self, tabs: list[Tab]) -> None:
        """Assign dense positions to an ordered list of tabs.

        Args:
            tabs: Ordered tab rows to mutate.
        """
        for offset, tab in enumerate(tabs):
            tab.position = float(offset)

    async def attach_tag(self, tab: Tab, tag: Tag) -> None:
        """Attach a loaded tag to a tab.

        Args:
            tab: Target tab row.
            tag: Tag row to attach.
        """
        tab.tags.append(tag)

    async def detach_tag(self, tab: Tab, tag: Tag) -> None:
        """Detach a loaded tag from a tab.

        Args:
            tab: Target tab row.
            tag: Tag row to detach.
        """
        tab.tags.remove(tag)

    async def hard_delete(self, tab_id: str) -> None:
        """Permanently delete a tab and record its tombstone.

        Args:
            tab_id: Tab identifier.
        """
        await self.session.execute(delete(Tab).where(Tab.id == tab_id))
        self.session.add(Tombstone(entity_type="tab", entity_id=tab_id))

    async def archive(self, tab: Tab) -> None:
        """Archive a tab in place.

        Args:
            tab: Tab row to archive.
        """
        now = utc_now()
        tab.archived = True
        tab.archived_at = now
        tab.updated_at = now

    async def tombstone_exists(self, entity_id: str) -> bool:
        """Check whether a tab tombstone exists.

        Args:
            entity_id: Tab identifier.

        Returns:
            Whether a matching tombstone exists.
        """
        return bool(
            await self.session.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == "tab", Tombstone.entity_id == entity_id
                )
            )
        )
