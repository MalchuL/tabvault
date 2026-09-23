"""Persistence for search candidates."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from domain.tabs.visibility import visible_tabs
from models import Tab, Tag


class SearchRepository:
    """Load visible tabs matching search filters.

    Attributes:
        session (AsyncSession): Request-scoped session used to read or stage rows without committing.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session.
        """
        self.session = session

    async def candidates(self, group_id: str | None, tags: list[str], now: datetime) -> list[Tab]:
        """Load search candidates with their tags.

        Args:
            group_id (str | None): Collection ID or null for Unassigned.
            tags (list[str]): Tag filters or associations for the operation.
            now (datetime): Current UTC instant used for consistent visibility decisions.

        Returns:
            list[Tab]: Matching saved-tab rows.
        """
        filters: list[ColumnElement[bool]] = [visible_tabs(now)]
        if group_id:
            filters.append(Tab.group_id == group_id)
        for tag in tags:
            filters.append(Tab.tags.any(func.lower(Tag.name) == tag.lower()))
        return list(
            (
                await self.session.scalars(
                    select(Tab).where(*filters).options(selectinload(Tab.tags))
                )
            ).unique()
        )
