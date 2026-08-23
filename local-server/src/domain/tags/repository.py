"""Persistence operations for tag use cases."""

from datetime import datetime

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import visible_tabs
from lib.base_repository import BaseRepository
from models import Tab, Tag, tab_tags


class TagRepository(BaseRepository[Tag]):
    """Persist tags and tab-tag associations.

    This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
    session. It reads or stages database state without committing; the calling service owns the
    surrounding transaction.
    """

    model_type = Tag

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        super().__init__(session)
        self.session = session

    async def get_casefold(self, name: str) -> Tag | None:
        """Load a tag using case-insensitive name matching.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            name (str): Human-readable name used by the operation.

        Returns:
            Tag | None: Result produced by the operation described above.
        """
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tag).where(func.lower(Tag.name) == name.lower())
        )

    async def list_with_counts(self, now: datetime) -> list[tuple[Tag, int]]:
        """List tags with visible active-tab counts.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            list[tuple[Tag, int]]: Result produced by the operation described above.
        """
        rows = await self.session.execute(
            select(Tag, func.count(Tab.id))
            .outerjoin(tab_tags, tab_tags.c.tag_name == Tag.name)
            .outerjoin(Tab, and_(Tab.id == tab_tags.c.tab_id, visible_tabs(now)))
            .group_by(Tag.name)
            .order_by(func.lower(Tag.name))
        )
        return [(tag, int(count)) for tag, count in rows.all()]

    async def count_visible_tabs(self, name: str, now: datetime) -> int:
        """Count visible active tabs attached to a tag.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            name (str): Human-readable name used by the operation.
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            int: Result produced by the operation described above.
        """
        return int(
            await self.session.scalar(
                select(func.count(Tab.id))
                .select_from(tab_tags)
                .join(Tab, Tab.id == tab_tags.c.tab_id)
                .where(tab_tags.c.tag_name == name, visible_tabs(now))
            )
            or 0
        )

    async def save(self, tag: Tag, changes: dict[str, object] | None = None) -> Tag:
        """Add a new tag or apply changes to an existing tag.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            tag (Tag): Tag value consumed by this operation.
            changes (dict[str, object] | None): Changes value consumed by this operation.

        Returns:
            Tag: Result produced by the operation described above.
        """
        if changes is None:
            self.session.add(tag)
            await self.session.flush()
            return tag
        for key, value in changes.items():
            setattr(tag, key, value)
        return tag

    async def count_tabs(self, name: str) -> int:
        """Count tabs attached to a tag name.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            name (str): Human-readable name used by the operation.

        Returns:
            int: Result produced by the operation described above.
        """
        return int(
            await self.session.scalar(
                select(func.count()).select_from(tab_tags).where(tab_tags.c.tag_name == name)
            )
            or 0
        )

    async def delete_tag(self, tag: Tag) -> None:
        """Detach and permanently delete a tag.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            tag (Tag): Tag value consumed by this operation.
        """
        await self.session.execute(delete(tab_tags).where(tab_tags.c.tag_name == tag.name))
        await self.session.delete(tag)
