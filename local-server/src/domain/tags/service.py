"""Tag application service and transaction boundaries."""

from sqlalchemy.ext.asyncio import AsyncSession

from lib.pagination import ListOptions
from lib.time import utc_now

from .dto import TagDeleteResultDTO, TagDTO, TagListResponseDTO, TagUpsertDTO
from .error import TagInUseError, TagNotFoundError
from .mapper import TagMapper
from .repository import TagRepository


class TagService:
    """Apply Tag catalog rules and own their database transactions.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        repository (TagRepository): Persistence adapter retained for this service instance.
        mapper (TagMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(self, db: AsyncSession, repository: TagRepository) -> None:
        """Create a Tag service using one request-scoped database session.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session.
            repository (TagRepository): Persistence adapter used by this service.
        """
        self.db = db
        self.repository = repository
        self.mapper = TagMapper()

    async def list(self, list_options: ListOptions) -> TagListResponseDTO:
        """List tags with counts of currently visible Saved Tabs.

        Args:
            list_options (ListOptions): Page size and row offset for the query.

        Returns:
            TagListResponseDTO: Tags with visible-tab counts and pagination metadata.
        """
        page = await self.repository.list_with_counts(utc_now(), list_options)
        return TagListResponseDTO.from_page(
            page.map(lambda item: self.mapper.to_dto(item[0], item[1]))
        )

    async def upsert(self, name: str, dto: TagUpsertDTO) -> TagDTO:
        """Create or update a tag using a case-insensitive name lookup.

        Args:
            name (str): Name identifying the tag or other target record.
            dto (TagUpsertDTO): Validated request data for the operation.

        Returns:
            TagDTO: Current tag name, description, and usage count.
        """
        tag = await self.repository.get_casefold(name)
        if tag is None:
            tag = self.mapper.from_upsert_dto(name, dto)
            await self.repository.save(tag)
        else:
            await self.repository.save(tag, self.mapper.to_update_dict(dto))
        await self.db.commit()
        return self.mapper.to_dto(
            tag, await self.repository.count_visible_tabs(tag.name, utc_now())
        )

    async def delete(self, name: str, detach: bool) -> TagDeleteResultDTO:
        """Require explicit detachment before deleting a tag used by any tab.

        Args:
            name (str): Name identifying the tag or other target record.
            detach (bool): Whether to remove this tag from associated tabs.

        Returns:
            TagDeleteResultDTO: Deleted tag name and number of detached tab links.

        Raises:
            TagNotFoundError: No tag has the requested name.
            TagInUseError: The tag is still attached to tabs and detaching was not requested.
        """
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
        """Render the tag catalog as Markdown, including undescribed tags.

        Returns:
            str: Markdown listing tags and their descriptions.
        """
        rows = (await self.repository.list_with_counts(utc_now())).data
        lines = ["# Tags", ""]
        lines.extend(
            f"- **{tag.name}** — {tag.description or '_(без описания)_'}" for tag, _ in rows
        )
        return "\n".join(lines) + "\n"
