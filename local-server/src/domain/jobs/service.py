"""Durable job query operations."""

from .dto import JobDTO
from .error import JobNotFoundError
from .mapper import JobMapper
from .repository import JobRepository


class JobService:
    """Read durable background-job state.

    Attributes:
        repository (JobRepository): Persistence adapter retained for this service instance.
        mapper (JobMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(self, repository: JobRepository) -> None:
        """Initialize durable-job persistence.

        Args:
            repository (JobRepository): Persistence adapter used by this service.
        """
        self.repository = repository
        self.mapper = JobMapper()

    async def get(self, job_id: str) -> JobDTO:
        """Return a job or raise the stable not-found error.

        Args:
            job_id (str): Identifier of the background job.

        Returns:
            JobDTO: Current job status, progress, result, and error.

        Raises:
            JobNotFoundError: No background job has the requested ID.
        """
        job = await self.repository.get(job_id)
        if job is None:
            raise JobNotFoundError(f"Job {job_id!r} was not found")
        return self.mapper.to_dto(job)
