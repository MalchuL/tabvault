"""Persistence operations for flat Group use cases."""

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from domain.tabs.visibility import hidden_tabs, visible_tabs
from lib.base_repository import BaseRepository
from models import Group, Tab, Tombstone


class GroupRepository(BaseRepository[Group]):
    """Persist Groups and transactional Group deletion.

    This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
    session. It reads or stages database state without committing; the calling service owns the
    surrounding transaction.
    """

    model_type = Group

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        super().__init__(session)
        self.session = session

    async def get(self, group_id: str) -> Group | None:  # type: ignore[override]
        """Load a Group by ID.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.

        Returns:
            Group | None: Result produced by the operation described above.
        """
        return await self.session.get(Group, group_id)

    async def list_groups(self, category: str | None = None) -> list[Group]:
        """List Groups newest first.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            category (str | None): Optional free-form Group category used to restrict results.

        Returns:
            list[Group]: Result produced by the operation described above.
        """
        query = select(Group)
        if category is not None:
            query = query.where(Group.category == category)
        return list(
            (
                await self.session.scalars(query.order_by(Group.created_at.desc(), Group.id.desc()))
            ).all()
        )

    async def tab_counts(self, now: datetime) -> tuple[dict[str, int], dict[str, int]]:
        """Count visible and hidden active tabs assigned to each Group.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            tuple[dict[str, int], dict[str, int]]: Result produced by the operation described above.
        """

        async def counts(predicate: ColumnElement[bool]) -> dict[str, int]:
            """Accumulate visible and hidden member counts for one Group row.

            This persistence-layer operation executes through the request-scoped asynchronous
            SQLAlchemy session. It reads or stages database state without committing; the calling
            service owns the surrounding transaction.

            Args:
                predicate (ColumnElement[bool]): Predicate value consumed by this operation.

            Returns:
                dict[str, int]: Result produced by the operation described above.
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
        """Find the next flat display position.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Returns:
            float: Result produced by the operation described above.
        """
        maximum = await self.session.scalar(select(func.coalesce(func.max(Group.position), -1)))
        return float(maximum if maximum is not None else -1) + 1

    async def add_group(self, group: Group) -> Group:
        """Persist one Group.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group (Group): Group value consumed by this operation.

        Returns:
            Group: Result produced by the operation described above.
        """
        self.session.add(group)
        await self.session.flush()
        return group

    async def apply_changes(self, group: Group, changes: dict[str, object]) -> None:
        """Apply mapped values to a Group row.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group (Group): Group value consumed by this operation.
            changes (dict[str, object]): Changes value consumed by this operation.
        """
        for key, value in changes.items():
            setattr(group, key, value)

    async def delete_with_tabs(self, group_id: str, now: datetime) -> int:
        """Archive and Unassign members, then permanently delete the Group.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            int: Result produced by the operation described above.
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
