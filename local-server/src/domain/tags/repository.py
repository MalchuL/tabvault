"""Persistence operations for tag use cases."""

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.base_repository import BaseRepository
from models import Tag, tab_tags


class TagRepository(BaseRepository[Tag]):
    """Persist tags and tab-tag associations."""

    model_type = Tag

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session."""
        super().__init__(session)
        self.session = session

    async def get_casefold(self, name: str) -> Tag | None:
        """Load a tag using case-insensitive name matching."""
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tag).where(func.lower(Tag.name) == name.lower())
        )

    async def list_with_counts(self) -> list[tuple[Tag, int]]:
        """List tags with their attached-tab counts."""
        rows = await self.session.execute(
            select(Tag, func.count(tab_tags.c.tab_id))
            .outerjoin(tab_tags, tab_tags.c.tag_name == Tag.name)
            .group_by(Tag.name)
            .order_by(func.lower(Tag.name))
        )
        return [(tag, int(count)) for tag, count in rows.all()]

    async def save(self, tag: Tag, changes: dict[str, object] | None = None) -> Tag:
        """Add a new tag or apply changes to an existing tag."""
        if changes is None:
            self.session.add(tag)
            await self.session.flush()
            return tag
        for key, value in changes.items():
            setattr(tag, key, value)
        return tag

    async def count_tabs(self, name: str) -> int:
        """Count tabs attached to a tag name."""
        return int(
            await self.session.scalar(
                select(func.count()).select_from(tab_tags).where(tab_tags.c.tag_name == name)
            )
            or 0
        )

    async def delete_tag(self, tag: Tag) -> None:
        """Detach and permanently delete a tag."""
        await self.session.execute(delete(tab_tags).where(tab_tags.c.tag_name == tag.name))
        await self.session.delete(tag)
