"""Vector index status, rebuild, and health scheduling."""

from sqlalchemy.ext.asyncio import AsyncSession

from domain.jobs.dto import JobQueuedDTO
from domain.jobs.mapper import JobMapper
from domain.jobs.repository import JobRepository
from lib.time import utc_now
from models import HealthSchedule

from .dto import HealthScheduleDTO, IndexStatusDTO
from .mapper import IndexingMapper
from .repository import IndexingRepository
from .vector_index import LocalVectorIndex


class IndexingService:
    """Own vector-index job and schedule transactions."""

    def __init__(
        self,
        db: AsyncSession,
        vectors: LocalVectorIndex,
        repository: IndexingRepository,
        jobs: JobRepository,
    ) -> None:
        """Initialize indexing dependencies."""
        self.db = db
        self.vectors = vectors
        self.repository = repository
        self.jobs = jobs
        self.mapper = IndexingMapper()
        self.job_mapper = JobMapper()

    async def queue_reindex(self) -> JobQueuedDTO:
        """Queue one rebuild unless an equivalent job is active."""
        existing = await self.jobs.find_active("search_reindex")
        if existing:
            return JobQueuedDTO(job_id=existing.id)
        job = await self.jobs.add(self.job_mapper.create("search_reindex"))
        await self.db.commit()
        return JobQueuedDTO(job_id=job.id)

    async def index_status(self) -> IndexStatusDTO:
        """Return vector and schedule state."""
        schedule = await self.repository.schedule()
        return IndexStatusDTO(
            **self.vectors.status().model_dump(),
            health_check=self.mapper.schedule(schedule),
        )

    async def health_schedule(self) -> HealthScheduleDTO:
        """Return the current health schedule."""
        return self.mapper.schedule(await self.repository.schedule())

    async def configure_health(self, interval: int, notify: bool | None) -> HealthScheduleDTO:
        """Persist health schedule settings."""
        schedule = await self.repository.schedule()
        changes: dict[str, object] = {"interval_seconds": interval}
        if notify is not None:
            changes["notify_on_needs_attention"] = notify
        self.repository.apply_schedule(schedule, **changes)
        await self.db.commit()
        return self.mapper.schedule(schedule)

    async def run_health(self) -> HealthScheduleDTO:
        """Run and persist a vector health check."""
        schedule: HealthSchedule = await self.repository.schedule()
        last_check = utc_now()
        last_result = "ready" if self.vectors.status().status == "ready" else "needs_attention"
        last_alert = (
            last_check
            if last_result == "needs_attention" and schedule.notify_on_needs_attention
            else None
        )
        self.repository.apply_schedule(
            schedule,
            last_check=last_check,
            last_result=last_result,
            last_alert=last_alert,
        )
        await self.db.commit()
        return self.mapper.schedule(schedule)
