from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.base_repository import BaseRepository
from models import Group, Tab


class GroupRepository(BaseRepository[Group]):
    model_type = Group

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)
        self.session = session

    async def get(self, group_id: str) -> Group | None:  # type: ignore[override]
        return await self.session.get(Group, group_id)

    async def active(self) -> list[Group]:
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
