from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.time import utc_now
from models import Tag, tab_tags

from .dto import TagUpsertDTO
from .error import TagInUseError, TagNotFoundError
from .mapper import TagMapper
from .repository import TagRepository


class TagService:
    def __init__(self, db: AsyncSession, repository: TagRepository) -> None:
        self.db = db
        self.repository = repository
        self.mapper = TagMapper()

    async def list(self) -> list[dict[str, object]]:
        return [
            self.mapper.to_dto(tag, count).model_dump(mode="json", by_alias=True)
            for tag, count in await self.repository.list_with_counts()
        ]

    async def upsert(self, name: str, dto: TagUpsertDTO) -> dict[str, object]:
        tag = await self.repository.get_casefold(name)
        if tag is None:
            tag = Tag(name=name, description=dto.description)
            self.db.add(tag)
        else:
            tag.description = dto.description
            tag.updated_at = utc_now()
        await self.db.commit()
        count = int(
            await self.db.scalar(
                select(func.count()).select_from(tab_tags).where(tab_tags.c.tag_name == tag.name)
            )
            or 0
        )
        return self.mapper.to_dto(tag, count).model_dump(mode="json", by_alias=True)

    async def delete(self, name: str, detach: bool) -> dict[str, object]:
        tag = await self.repository.get_casefold(name)
        if tag is None:
            raise TagNotFoundError(f"Tag {name!r} was not found")
        count = int(
            await self.db.scalar(
                select(func.count()).select_from(tab_tags).where(tab_tags.c.tag_name == tag.name)
            )
            or 0
        )
        if count and not detach:
            raise TagInUseError(f"Tag {name!r} is attached to {count} tabs")
        await self.db.execute(delete(tab_tags).where(tab_tags.c.tag_name == tag.name))
        await self.db.delete(tag)
        await self.db.commit()
        return {"name": name, "detachedFromTabs": count}

    async def markdown(self) -> str:
        rows = await self.repository.list_with_counts()
        lines = ["# Tags", ""]
        lines.extend(
            f"- **{tag.name}** — {tag.description or '_(без описания)_'}" for tag, _ in rows
        )
        return "\n".join(lines) + "\n"
