"""Queries and staged writes for flat groups and their member tabs."""

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from domain.tabs.visibility import hidden_tabs, visible_tabs
from lib.base_repository import BaseRepository
from lib.pagination import ListOptions, Page
from models import Group, Tab, Tombstone


class GroupRepository(BaseRepository[Group]):
    """Query groups and stage their mutations through one async session.

    The service commits or rolls back the session, including tab changes and the tombstone
    staged when a group is deleted.

    Attributes:
        session (AsyncSession): Request-scoped session used to read or stage rows without committing.
    """

    model_type = Group

    def __init__(self, session: AsyncSession) -> None:
        """Bind group operations to the service's request-scoped transaction.

        Args:
            session (AsyncSession): Session shared with the calling service, which owns commit
                and rollback.
        """
        super().__init__(session)
        self.session = session

    async def get(self, group_id: str) -> Group | None:  # type: ignore[override]
        """Load a group by its primary key without filtering by tab visibility.

        Args:
            group_id (str): Stable group identifier to look up.

        Returns:
            Group | None: The group row, or ``None`` if the identifier does not exist.
        """
        return await self.session.get(Group, group_id)

    async def list_groups(
        self,
        now: datetime,
        visibility: str,
        category: str | None,
        list_options: ListOptions,
    ) -> Page[tuple[Group, int]]:
        """Page groups relevant to the requested active-tab visibility.

        Hidden groups have at least one hidden active tab. The other view includes groups
        with visible active tabs and groups with no hidden active tabs. Counts match the
        selected view. Results sort by creation time and then ID, both descending; total
        counts matching groups before limit and offset are applied.

        Args:
            now (datetime): Instant at which tab hide deadlines are evaluated.
            visibility (str): ``"hidden"`` for hidden groups; other values use the visible
                view. The service handles archived visibility separately.
            category (str | None): Exact category filter, or ``None`` for all categories.
            list_options (ListOptions): Validated limit and offset for the database query.

        Returns:
            Page[tuple[Group, int]]: Group rows paired with their selected-view tab counts,
                plus total and next-page metadata.
        """
        visible_count = (
            select(func.count(Tab.id))
            .where(Tab.group_id == Group.id, visible_tabs(now))
            .correlate(Group)
            .scalar_subquery()
        )
        hidden_count = (
            select(func.count(Tab.id))
            .where(Tab.group_id == Group.id, hidden_tabs(now))
            .correlate(Group)
            .scalar_subquery()
        )
        filters = []
        if category is not None:
            filters.append(Group.category == category)
        if visibility == "hidden":
            filters.append(hidden_count > 0)
            tab_count = hidden_count
        else:
            filters.append((visible_count > 0) | (hidden_count == 0))
            tab_count = visible_count
        total = int(
            await self.session.scalar(select(func.count()).select_from(Group).where(*filters)) or 0
        )
        rows = (
            await self.session.execute(
                select(Group, tab_count.label("tab_count"))
                .where(*filters)
                .order_by(Group.created_at.desc(), Group.id.desc())
                .limit(list_options.limit)
                .offset(list_options.offset)
            )
        ).all()
        data = [(group, int(count)) for group, count in rows]
        return Page(
            data=data,
            has_next=list_options.offset + len(data) < total,
            total=total,
        )

    async def tab_counts(self, now: datetime) -> tuple[dict[str, int], dict[str, int]]:
        """Count visible and hidden active tabs by group ID.

        Each visibility uses its own grouped query. Archived and unassigned tabs are
        excluded; groups with zero matching tabs have no entry in that dictionary.

        Args:
            now (datetime): Instant at which tab hide deadlines are evaluated.

        Returns:
            tuple[dict[str, int], dict[str, int]]: Visible counts followed by hidden counts,
                keyed by group ID.
        """

        async def counts(predicate: ColumnElement[bool]) -> dict[str, int]:
            """Count assigned tabs matching one visibility predicate.

            Args:
                predicate (ColumnElement[bool]): SQL condition for visible or hidden active tabs.

            Returns:
                dict[str, int]: Matching tab counts keyed by non-null group ID.
            """
            return {
                str(group_id): int(count)
                for group_id, count in (
                    await self.session.execute(
                        select(Tab.group_id, func.count(Tab.id))
                        .where(predicate, Tab.group_id.is_not(None))
                        .group_by(Tab.group_id)
                    )
                ).all()
            }

        return await counts(visible_tabs(now)), await counts(hidden_tabs(now))

    async def next_position(self) -> float:
        """Place a new group after the current highest flat display position.

        Existing gaps are not reused. An empty groups table starts at position zero.

        Returns:
            float: Maximum stored position plus one, or ``0.0`` when there are no groups.
        """
        maximum = await self.session.scalar(select(func.coalesce(func.max(Group.position), -1)))
        return float(maximum if maximum is not None else -1) + 1

    async def add_group(self, group: Group) -> Group:
        """Add a group and flush it so database-generated values are available.

        The row remains in the caller's open transaction until the service commits.

        Args:
            group (Group): New mapped group row to stage.

        Returns:
            Group: The same row after the session flush.
        """
        self.session.add(group)
        await self.session.flush()
        return group

    async def apply_changes(self, group: Group, changes: dict[str, object]) -> None:
        """Assign service-approved changes to a loaded group row.

        SQLAlchemy tracks these assignments for the service's later commit. This method
        does not validate field names, flush, or commit.

        Args:
            group (Group): Persistent group row to update.
            changes (dict[str, object]): Mapped attribute names and replacement values.
        """
        for key, value in changes.items():
            setattr(group, key, value)

    async def delete_with_tabs(self, group_id: str, now: datetime) -> int:
        """Archive and unassign every member before deleting its group.

        All assigned tabs, regardless of current visibility or archive state, receive the
        archive and update timestamps. The group row is deleted and a group tombstone is
        staged in the same service-owned transaction.

        Args:
            group_id (str): Identifier of the group whose members are archived and unassigned.
            now (datetime): Timestamp stored on affected tabs when the group is deleted.

        Returns:
            int: Number of tabs assigned to the group before deletion, including tabs that
                were already archived.
        """
        archived_tab_count = int(
            await self.session.scalar(select(func.count(Tab.id)).where(Tab.group_id == group_id))
            or 0
        )
        await self.session.execute(
            update(Tab)
            .where(Tab.group_id == group_id)
            .values(group_id=None, archived=True, archived_at=now, updated_at=now)
        )
        await self.session.execute(delete(Group).where(Group.id == group_id))
        self.session.add(Tombstone(entity_type="group", entity_id=group_id))
        return archived_tab_count
