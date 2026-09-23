"""Persistence for server health metadata."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import visible_tabs
from models import Group, Tab, Tag


class SystemRepository:
    """Read the counts needed by system health.

    Attributes:
        session (AsyncSession): Request-scoped session used to read or stage rows without committing.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session.
        """
        self.session = session

    async def health_counts(self, now: datetime) -> tuple[int, int, int]:
        """Count visible tabs, groups, and tags.

        Args:
            now (datetime): Current UTC instant used for consistent visibility decisions.

        Returns:
            tuple[int, int, int]: Counts of active, archived, and hidden tabs.
        """
        tabs = int(
            await self.session.scalar(select(func.count(Tab.id)).where(visible_tabs(now))) or 0
        )
        groups = int(await self.session.scalar(select(func.count(Group.id))) or 0)
        tags = int(await self.session.scalar(select(func.count(Tag.name))) or 0)
        return tabs, groups, tags
