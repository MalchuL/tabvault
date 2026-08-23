"""Tag application service and transaction boundaries."""

from sqlalchemy.ext.asyncio import AsyncSession

from lib.pagination import ListOptions
from lib.time import utc_now

from .dto import TagDeleteResultDTO, TagDTO, TagListResponseDTO, TagUpsertDTO
from .error import TagInUseError, TagNotFoundError
from .mapper import TagMapper
from .repository import TagRepository


class TagService:
    """Orchestrate tag use cases while owning transactions.

    This application-layer operation coordinates domain rules and persistence, then maps loaded ORM
    state into transport DTOs. Callers do not need to know how records are queried or related data
    is assembled.
    """

    def __init__(self, db: AsyncSession, repository: TagRepository) -> None:
        """Initialize the service and its persistence dependency.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session used by this operation.
            repository (TagRepository): Persistence adapter used to load and mutate domain records.
        """
        self.db = db
        self.repository = repository
        self.mapper = TagMapper()

    async def list(self, list_options: ListOptions) -> TagListResponseDTO:
        """List tags with usage counts.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Returns:
            TagListResponseDTO: Result produced by the operation described above.
        """
        page = await self.repository.list_with_counts(utc_now(), list_options)
        return TagListResponseDTO.from_page(
            page.map(lambda item: self.mapper.to_dto(item[0], item[1]))
        )

    async def upsert(self, name: str, dto: TagUpsertDTO) -> TagDTO:
        """Create or update a tag.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            name (str): Human-readable name used by the operation.
            dto (TagUpsertDTO): Validated data-transfer object supplied to the operation.

        Returns:
            TagDTO: Result produced by the operation described above.
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
        """Delete a tag, optionally detaching it from tabs.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            name (str): Human-readable name used by the operation.
            detach (bool): Detach value consumed by this operation.

        Returns:
            TagDeleteResultDTO: Result produced by the operation described above.

        Raises:
            TagInUseError: Propagated when its documented validation or operation condition occurs.
            TagNotFoundError: Propagated when its documented validation or operation condition
                occurs.
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
        """Render the tag catalog as Markdown.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Returns:
            str: Result produced by the operation described above.
        """
        rows = (await self.repository.list_with_counts(utc_now())).data
        lines = ["# Tags", ""]
        lines.extend(
            f"- **{tag.name}** — {tag.description or '_(без описания)_'}" for tag, _ in rows
        )
        return "\n".join(lines) + "\n"
