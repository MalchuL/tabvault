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
    """Own vector-index job and schedule transactions.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        vectors (LocalVectorIndex): Shared local vector index used for semantic search and indexing.
        repository (IndexingRepository): Persistence adapter retained for this service instance.
        jobs (JobRepository): Repository used to queue or inspect background jobs.
        mapper (IndexingMapper): Stateless converter between ORM rows and API DTOs.
        job_mapper (JobMapper): Stateless converter for background-job DTOs.
    """

    def __init__(
        self,
        db: AsyncSession,
        vectors: LocalVectorIndex,
        repository: IndexingRepository,
        jobs: JobRepository,
    ) -> None:
        """Initialize indexing dependencies.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session.
            vectors (LocalVectorIndex): Vector index used for semantic search.
            repository (IndexingRepository): Persistence adapter used by this service.
            jobs (JobRepository): Background-job repository or worker dependency.
        """
        self.db = db
        self.vectors = vectors
        self.repository = repository
        self.jobs = jobs
        self.mapper = IndexingMapper()
        self.job_mapper = JobMapper()

    async def queue_reindex(self) -> JobQueuedDTO:
        """Queue one rebuild unless an equivalent job is active.

        Returns:
            JobQueuedDTO: Identifier and state of the queued background job.
        """
        existing = await self.jobs.find_active("search_reindex")
        if existing:
            return JobQueuedDTO(job_id=existing.id)
        job = await self.jobs.add(self.job_mapper.create("search_reindex"))
        await self.db.commit()
        return JobQueuedDTO(job_id=job.id)

    async def index_status(self) -> IndexStatusDTO:
        """Return vector and schedule state.

        Returns:
            IndexStatusDTO: Index readiness, model, and indexed-tab count.
        """
        schedule = await self.repository.schedule()
        return IndexStatusDTO(
            **self.vectors.status().model_dump(),
            health_check=self.mapper.schedule(schedule),
        )

    async def health_schedule(self) -> HealthScheduleDTO:
        """Return the current health schedule.

        Returns:
            HealthScheduleDTO: Configured interval and latest check or alert state.
        """
        return self.mapper.schedule(await self.repository.schedule())

    async def configure_health(self, interval: int, notify: bool | None) -> HealthScheduleDTO:
        """Persist health schedule settings.

        Args:
            interval (int): Seconds between index health checks; zero disables scheduling.
            notify (bool | None): Whether failures should trigger a health alert.

        Returns:
            HealthScheduleDTO: Configured interval and latest check or alert state.
        """
        schedule = await self.repository.schedule()
        changes: dict[str, object] = {"interval_seconds": interval}
        if notify is not None:
            changes["notify_on_needs_attention"] = notify
        self.repository.apply_schedule(schedule, **changes)
        await self.db.commit()
        return self.mapper.schedule(schedule)

    async def run_health(self) -> HealthScheduleDTO:
        """Run and persist a vector health check.

        Returns:
            HealthScheduleDTO: Configured interval and latest check or alert state.
        """
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
