"""Persistence operations for Saved Tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import asc, delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from lib.base_repository import BaseRepository
from lib.pagination import ListOptions, Page
from lib.time import utc_now
from models import Group, Job, Tab, Tag, Tombstone

from .dto import SortDirection, TabSortBy
from .visibility import TabVisibility, tabs_for_visibility


class TabRepository(BaseRepository[Tab]):
    """Persist Saved Tabs and directly related records.

    Methods read or stage rows in the request-scoped asynchronous session. They do
    not commit; the calling service controls the transaction boundary.

    Attributes:
        session (AsyncSession): Session shared by tab and related-record operations.
    """

    model_type = Tab

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        super().__init__(session)
        self.session = session

    async def get(self, tab_id: str) -> Tab | None:  # type: ignore[override]
        """Load one Saved Tab with tags.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            Tab | None: Saved tab with tags loaded, or None if the ID is absent.
        """
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
        list_options: ListOptions,
        visibility: TabVisibility,
        now: datetime,
    ) -> Page[Tab]:
        """List and count filtered Saved Tabs using database pagination.

        Args:
            group_id (str | None | object): Stable identifier of the group targeted by the
                operation.
            category (str | None): Optional free-form Group category used to restrict results.
            tags_any (list[str]): Tag names of which matching tabs need at least one.
            tags_all (list[str]): Tag names all matching tabs must contain.
            search (str | None): Optional case-insensitive text query.
            sort_by (TabSortBy): Saved-tab field used for ordering.
            sort_dir (SortDirection): Directory used to store sort data.
            list_options (ListOptions): Validated page size and row offset.
            visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            Page[Tab]: Matching rows and pagination metadata.
        """
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
        ordering = asc if sort_dir == "asc" else desc
        return await self.list_page(
            *filters,
            list_options=list_options,
            load=selectinload(Tab.tags),
            order_by=[ordering(sort_column), ordering(Tab.id)],
        )

    async def active_group_exists(self, group_id: str | None) -> bool:
        """Return whether a nullable Group target is valid.

        Args:
            group_id (str | None): Stable identifier of the group targeted by the operation.

        Returns:
            bool: True for Unassigned or an existing group ID.
        """
        if group_id is None:
            return True
        return bool(await self.session.scalar(select(Group.id).where(Group.id == group_id)))

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags.

        Args:
            names (list[str]): Input tag names, trimmed and deduplicated in first-seen order.

        Returns:
            list[Tag]: Distinct tag rows in first-seen input order.
        """
        result: list[Tag] = []
        for raw in dict.fromkeys(name.strip() for name in names if name.strip()):
            tag, _created = await self.get_or_create_tag(raw)
            result.append(tag)
        return result

    async def get_or_create_tag(self, name: str) -> tuple[Tag, bool]:
        """Load a tag case-insensitively or create it.

        Args:
            name (str): Human-readable name used by the operation.

        Returns:
            tuple[Tag, bool]: Tag row and whether it was newly created.
        """
        tag = await self.session.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is not None:
            return tag, False
        tag = Tag(name=name, description=None)
        self.session.add(tag)
        await self.session.flush()
        return tag, True

    async def next_position(self, group_id: str | None) -> float:
        """Find the next display position in a Group or Unassigned.

        Args:
            group_id (str | None): Stable identifier of the group targeted by the operation.

        Returns:
            float: Position immediately after the last active tab in the group.
        """
        condition = Tab.group_id.is_(None) if group_id is None else Tab.group_id == group_id
        maximum = await self.session.scalar(
            select(func.coalesce(func.max(Tab.position), -1)).where(
                condition, Tab.archived.is_(False)
            )
        )
        return float(maximum if maximum is not None else -1) + 1

    async def reorder_tabs(
        self, group_id: str | None, tab_ids: list[str], updated_at: datetime
    ) -> bool:
        """Stage normalized positions for an ordered subset of one active tab scope.

        Active rows are loaded in their current deterministic order. Requested rows move to the
        front in the supplied order, while omitted rows are appended in their existing order. This
        preserves tabs created or hidden concurrently. No commit occurs here; the service owns the
        transaction and rolls the whole reorder back when validation fails.

        Args:
            group_id (str | None): Persisted Group identifier, or ``None`` for Unassigned.
            tab_ids (list[str]): Unique Saved Tab IDs in their desired relative order.
            updated_at (datetime): UTC timestamp applied consistently to every reordered row.

        Returns:
            bool: ``True`` after positions are staged, or ``False`` when any supplied ID is missing,
                archived, or assigned to another Group and no row was changed.
        """
        condition = Tab.group_id.is_(None) if group_id is None else Tab.group_id == group_id
        rows = list(
            (
                await self.session.scalars(
                    select(Tab)
                    .where(condition, Tab.archived.is_(False))
                    .order_by(Tab.position, Tab.id)
                )
            ).all()
        )
        by_id = {tab.id: tab for tab in rows}
        if any(tab_id not in by_id for tab_id in tab_ids):
            return False
        requested = set(tab_ids)
        ordered = [by_id[tab_id] for tab_id in tab_ids]
        ordered.extend(tab for tab in rows if tab.id not in requested)
        for position, tab in enumerate(ordered):
            tab.position = float(position)
            tab.updated_at = updated_at
        return True

    async def add_tab(self, tab: Tab) -> Tab:
        """Persist one Saved Tab occurrence.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.

        Returns:
            Tab: Newly staged tab row after assigning its position and tags.
        """
        self.session.add(tab)
        await self.session.flush()
        return tab

    async def add_tabs(self, tabs: list[Tab]) -> None:
        """Stage and flush multiple Saved Tab occurrences together.

        Browser capture uses this specialized operation to let SQLAlchemy batch inserts while the
        service retains the surrounding transaction boundary.

        Args:
            tabs (list[Tab]): Saved Tab rows to persist in request order.
        """
        self.session.add_all(tabs)
        await self.session.flush()

    async def add_preview_job(self, tab_id: str) -> Job:
        """Create a preview-capture job for a Saved Tab.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            Job: Newly staged preview-capture job for the tab.
        """
        job = Job(kind="preview_capture", target_id=tab_id)
        self.session.add(job)
        await self.session.flush()
        return job

    async def add_preview_jobs(self, tab_ids: list[str]) -> list[Job]:
        """Stage and flush one preview-capture job per Saved Tab together.

        Args:
            tab_ids (list[str]): Persisted Saved Tab identifiers in request order.

        Returns:
            list[Job]: Preview jobs in the same order as ``tab_ids``.
        """
        jobs = [Job(kind="preview_capture", target_id=tab_id) for tab_id in tab_ids]
        self.session.add_all(jobs)
        await self.session.flush()
        return jobs

    async def apply_changes(self, tab: Tab, changes: dict[str, object]) -> None:
        """Apply mapped field values to a Saved Tab.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.
            changes (dict[str, object]): Validated field values to apply to the existing row.
        """
        for key, value in changes.items():
            setattr(tab, key, value)

    async def attach_tag(self, tab: Tab, tag: Tag) -> None:
        """Attach a loaded tag to a Saved Tab.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.
            tag (Tag): Tag row being converted or persisted.
        """
        tab.tags.append(tag)

    async def detach_tag(self, tab: Tab, tag: Tag) -> None:
        """Detach a loaded tag from a Saved Tab.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.
            tag (Tag): Tag row being converted or persisted.
        """
        tab.tags.remove(tag)

    async def hard_delete(self, tab_id: str) -> None:
        """Permanently delete a Saved Tab and record its tombstone.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.
        """
        await self.session.execute(delete(Tab).where(Tab.id == tab_id))
        self.session.add(Tombstone(entity_type="tab", entity_id=tab_id))

    async def archive(self, tab: Tab) -> None:
        """Archive and Unassign a Saved Tab.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.
        """
        now = utc_now()
        tab.group_id = None
        tab.archived = True
        tab.archived_at = now
        tab.updated_at = now
