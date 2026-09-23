"""Persistence for index scheduling and source tabs."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import visible_tabs
from models import HealthSchedule, Tab


class IndexingRepository:
    """Read index inputs and stage health schedules.

    Attributes:
        session (AsyncSession): Request-scoped session used to read or stage rows without committing.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session.
        """
        self.session = session

    async def schedule(self) -> HealthSchedule:
        """Load or initialize the singleton schedule.

        Returns:
            HealthSchedule: HealthSchedule row read or staged by this operation.
        """
        schedule = await self.session.get(HealthSchedule, 1)
        if schedule is None:
            schedule = HealthSchedule(id=1)
            self.session.add(schedule)
            await self.session.flush()
        return schedule

    @staticmethod
    def apply_schedule(schedule: HealthSchedule, **changes: object) -> None:
        """Stage schedule field changes.

        Args:
            schedule (HealthSchedule): Current persisted health-check schedule.
            **changes (object): Schedule fields and values to stage.
        """
        for key, value in changes.items():
            setattr(schedule, key, value)

    async def active_tabs(self, now: datetime) -> list[Tab]:
        """Load visible tabs for vector indexing.

        Args:
            now (datetime): Current UTC instant used for consistent visibility decisions.

        Returns:
            list[Tab]: Matching saved-tab rows.
        """
        return list((await self.session.scalars(select(Tab).where(visible_tabs(now)))).all())
