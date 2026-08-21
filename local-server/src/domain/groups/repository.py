"""Persistence operations for group use cases."""

from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.base_repository import BaseRepository
from models import Group, Tab, Tombstone


class GroupRepository(BaseRepository[Group]):
    """Persist groups and group-scoped tab changes."""

    model_type = Group

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session."""
        super().__init__(session)
        self.session = session

    async def get(self, group_id: str) -> Group | None:  # type: ignore[override]
        """Load a group by ID."""
        return await self.session.get(Group, group_id)

    async def active(self) -> list[Group]:
        """List active groups in display order."""
        return list(
            (
                await self.session.scalars(
                    select(Group)
                    .where(Group.archived.is_(False))
                    .order_by(Group.position, Group.name)
                )
            ).all()
        )

    async def tab_counts(self) -> dict[str, int]:
        """Count active tabs directly assigned to each group."""
        return {
            str(group_id): int(count)
            for group_id, count in (
                await self.session.execute(
                    select(Tab.group_id, func.count(Tab.id))
                    .where(Tab.archived.is_(False), Tab.group_id.is_not(None))
                    .group_by(Tab.group_id)
                )
            ).all()
        }

    async def next_position(self, parent_id: str | None) -> float:
        """Find the next display position below a parent group."""
        maximum = await self.session.scalar(
            select(func.coalesce(func.max(Group.position), -1)).where(Group.parent_id == parent_id)
        )
        return float(maximum if maximum is not None else -1) + 1

    async def add_group(self, group: Group) -> Group:
        """Persist a new group."""
        self.session.add(group)
        await self.session.flush()
        return group

    async def apply_changes(self, group: Group, changes: dict[str, object]) -> None:
        """Apply mapped values to a group row."""
        for key, value in changes.items():
            setattr(group, key, value)

    async def active_children(self, group_id: str) -> list[Group]:
        """Load active direct children of a group."""
        return list(
            (
                await self.session.scalars(
                    select(Group).where(
                        Group.parent_id == group_id,
                        Group.archived.is_(False),
                    )
                )
            ).all()
        )

    async def active_tabs(self, group_id: str) -> list[Tab]:
        """Load active tabs directly assigned to a group."""
        return list(
            (
                await self.session.scalars(
                    select(Tab).where(Tab.group_id == group_id, Tab.archived.is_(False))
                )
            ).all()
        )

    async def archive_tree(self, group_ids: set[str], now: datetime) -> None:
        """Archive groups and tabs within a group tree."""
        groups = (await self.session.scalars(select(Group).where(Group.id.in_(group_ids)))).all()
        tabs = (await self.session.scalars(select(Tab).where(Tab.group_id.in_(group_ids)))).all()
        for group in groups:
            group.archived = True
            group.archived_at = now
            group.updated_at = now
        for tab in tabs:
            tab.archived = True
            tab.archived_at = now
            tab.updated_at = now

    async def promote_children(
        self,
        group: Group,
        children: list[Group],
        tabs: list[Tab],
        now: datetime,
    ) -> None:
        """Promote children and tabs before archiving a group."""
        for child in children:
            child.parent_id = group.parent_id
            child.updated_at = now
        for tab in tabs:
            tab.group_id = group.parent_id
            tab.updated_at = now
        group.archived = True
        group.archived_at = now
        group.updated_at = now

    async def hard_delete(self, group_id: str) -> None:
        """Permanently delete a group and record its tombstone."""
        await self.session.execute(delete(Group).where(Group.id == group_id))
        self.session.add(Tombstone(entity_type="group", entity_id=group_id))
