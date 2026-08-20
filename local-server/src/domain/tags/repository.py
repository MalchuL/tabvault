from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.base_repository import BaseRepository
from models import Tag, tab_tags


class TagRepository(BaseRepository[Tag]):
    model_type = Tag

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)
        self.session = session

    async def get_casefold(self, name: str) -> Tag | None:
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tag).where(func.lower(Tag.name) == name.lower())
        )

    async def list_with_counts(self) -> list[tuple[Tag, int]]:
        rows = await self.session.execute(
            select(Tag, func.count(tab_tags.c.tab_id))
            .outerjoin(tab_tags, tab_tags.c.tag_name == Tag.name)
            .group_by(Tag.name)
            .order_by(func.lower(Tag.name))
        )
        return [(tag, int(count)) for tag, count in rows.all()]
