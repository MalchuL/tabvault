"""Persistence operations for flat Group use cases."""

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from domain.tabs.visibility import hidden_tabs, visible_tabs
from lib.base_repository import BaseRepository
from models import Group, Tab, Tombstone


class GroupRepository(BaseRepository[Group]):
    """Persist Groups and transactional Group deletion."""

    model_type = Group

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session."""
        super().__init__(session)
        self.session = session

    async def get(self, group_id: str) -> Group | None:  # type: ignore[override]
        """Load a Group by ID."""
        return await self.session.get(Group, group_id)

    async def list_groups(self, category: str | None = None) -> list[Group]:
        """List Groups newest first."""
        query = select(Group)
        if category is not None:
            query = query.where(Group.category == category)
        return list(
            (
                await self.session.scalars(query.order_by(Group.created_at.desc(), Group.id.desc()))
            ).all()
        )

    async def tab_counts(self, now: datetime) -> tuple[dict[str, int], dict[str, int]]:
        """Count visible and hidden active tabs assigned to each Group."""

        async def counts(predicate: ColumnElement[bool]) -> dict[str, int]:
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
        """Find the next flat display position."""
        maximum = await self.session.scalar(select(func.coalesce(func.max(Group.position), -1)))
        return float(maximum if maximum is not None else -1) + 1

    async def add_group(self, group: Group) -> Group:
        """Persist one Group."""
        self.session.add(group)
        await self.session.flush()
        return group

    async def apply_changes(self, group: Group, changes: dict[str, object]) -> None:
        """Apply mapped values to a Group row."""
        for key, value in changes.items():
            setattr(group, key, value)

    async def delete_with_tabs(self, group_id: str, now: datetime) -> int:
        """Archive and Unassign members, then permanently delete the Group."""
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
