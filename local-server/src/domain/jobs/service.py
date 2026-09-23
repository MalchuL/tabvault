"""Durable job query operations."""

from .dto import JobDTO
from .error import JobNotFoundError
from .mapper import JobMapper
from .repository import JobRepository


class JobService:
    """Read durable background-job state."""

    def __init__(self, repository: JobRepository) -> None:
        """Initialize durable-job persistence."""
        self.repository = repository
        self.mapper = JobMapper()

    async def get(self, job_id: str) -> JobDTO:
        """Return a job or raise the stable not-found error."""
        job = await self.repository.get(job_id)
        if job is None:
            raise JobNotFoundError(f"Job {job_id!r} was not found")
        return self.mapper.to_dto(job)
