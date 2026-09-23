"""Persistence operations for tag use cases."""

from datetime import datetime

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import visible_tabs
from lib.base_repository import BaseRepository
from lib.pagination import ListOptions, Page
from models import Tab, Tag, tab_tags


class TagRepository(BaseRepository[Tag]):
    """Persist tags and tab-tag associations.

    Methods read or stage rows in the request-scoped asynchronous session. They do
    not commit; the calling service controls the transaction boundary.

    Attributes:
        session (AsyncSession): Session shared by tag and tab-tag operations.
    """

    model_type = Tag

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        super().__init__(session)
        self.session = session

    async def get_casefold(self, name: str) -> Tag | None:
        """Load a tag using case-insensitive name matching.

        Args:
            name (str): Human-readable name used by the operation.

        Returns:
            Tag | None: Matching tag row, or None when no name matches.
        """
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tag).where(func.lower(Tag.name) == name.lower())
        )

    async def list_with_counts(
        self, now: datetime, list_options: ListOptions | None = None
    ) -> Page[tuple[Tag, int]]:
        """List tags with visible active-tab counts.

        Args:
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.
            list_options (ListOptions | None): Optional database page; omitted for full exports.

        Returns:
            Page[tuple[Tag, int]]: Tag rows, usage counts, and pagination metadata.
        """
        total = int(await self.session.scalar(select(func.count()).select_from(Tag)) or 0)
        query = (
            select(Tag, func.count(Tab.id))
            .outerjoin(tab_tags, tab_tags.c.tag_name == Tag.name)
            .outerjoin(Tab, and_(Tab.id == tab_tags.c.tab_id, visible_tabs(now)))
            .group_by(Tag.name)
            .order_by(func.lower(Tag.name))
        )
        if list_options is not None:
            query = query.limit(list_options.limit).offset(list_options.offset)
        rows = await self.session.execute(query)
        data = [(tag, int(count)) for tag, count in rows.all()]
        offset = list_options.offset if list_options is not None else 0
        return Page(data=data, has_next=offset + len(data) < total, total=total)

    async def count_visible_tabs(self, name: str, now: datetime) -> int:
        """Count visible active tabs attached to a tag.

        Args:
            name (str): Human-readable name used by the operation.
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            int: Number of currently visible active tabs with this tag.
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

        Args:
            tag (Tag): Tag row being converted or persisted.
            changes (dict[str, object] | None): Validated field values to apply to the existing row.

        Returns:
            Tag: Newly staged or updated tag row.
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

        Args:
            name (str): Human-readable name used by the operation.

        Returns:
            int: Number of tabs currently associated with the tag.
        """
        return int(
            await self.session.scalar(
                select(func.count()).select_from(tab_tags).where(tab_tags.c.tag_name == name)
            )
            or 0
        )

    async def delete_tag(self, tag: Tag) -> None:
        """Detach and permanently delete a tag.

        Args:
            tag (Tag): Tag row being converted or persisted.
        """
        await self.session.execute(delete(tab_tags).where(tab_tags.c.tag_name == tag.name))
        await self.session.delete(tag)
