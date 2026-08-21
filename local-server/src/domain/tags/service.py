"""Tag application service and transaction boundaries."""

from sqlalchemy.ext.asyncio import AsyncSession

from .dto import TagDeleteResultDTO, TagDTO, TagUpsertDTO
from .error import TagInUseError, TagNotFoundError
from .mapper import TagMapper
from .repository import TagRepository


class TagService:
    """Orchestrate tag use cases while owning transactions."""

    def __init__(self, db: AsyncSession, repository: TagRepository) -> None:
        """Initialize the service and its persistence dependency."""
        self.db = db
        self.repository = repository
        self.mapper = TagMapper()

    async def list(self) -> list[TagDTO]:
        """List tags with usage counts."""
        return [
            self.mapper.to_dto(tag, count)
            for tag, count in await self.repository.list_with_counts()
        ]

    async def upsert(self, name: str, dto: TagUpsertDTO) -> TagDTO:
        """Create or update a tag."""
        tag = await self.repository.get_casefold(name)
        if tag is None:
            tag = self.mapper.from_upsert_dto(name, dto)
            await self.repository.save(tag)
        else:
            await self.repository.save(tag, self.mapper.to_update_dict(dto))
        await self.db.commit()
        return self.mapper.to_dto(tag, await self.repository.count_tabs(tag.name))

    async def delete(self, name: str, detach: bool) -> TagDeleteResultDTO:
        """Delete a tag, optionally detaching it from tabs."""
        tag = await self.repository.get_casefold(name)
        if tag is None:
            raise TagNotFoundError(f"Tag {name!r} was not found")
        count = await self.repository.count_tabs(tag.name)
        if count and not detach:
            raise TagInUseError(f"Tag {name!r} is attached to {count} tabs")
        await self.repository.delete_tag(tag)
        await self.db.commit()
        return TagDeleteResultDTO(name=name, detached_from_tabs=count)

    async def markdown(self) -> str:
        """Render the tag catalog as Markdown."""
        rows = await self.repository.list_with_counts()
        lines = ["# Tags", ""]
        lines.extend(
            f"- **{tag.name}** — {tag.description or '_(без описания)_'}" for tag, _ in rows
        )
        return "\n".join(lines) + "\n"
