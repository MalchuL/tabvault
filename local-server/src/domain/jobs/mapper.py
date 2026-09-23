"""Mappings for durable jobs."""

from typing import Any

from models import Job

from .dto import JobDTO


class JobMapper:
    """Map durable job rows and creation values."""

    @staticmethod
    def to_dto(job: Job) -> JobDTO:
        """Convert a job row to its wire DTO.

        Args:
            job (Job): Background job row being converted or persisted.

        Returns:
            JobDTO: Current job status, progress, result, and error.
        """
        return JobDTO(
            id=job.id,
            status=job.status,
            progress=job.progress,
            result=job.result,
            error=job.error,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    @staticmethod
    def create(
        kind: str,
        target_id: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> Job:
        """Create a pending job row.

        Args:
            kind (str): Kind of job or asset being created.
            target_id (str | None): Identifier of the job target, if any.
            result (dict[str, Any] | None): Initial structured result attached to the job.

        Returns:
            Job: Job row read or staged by this operation.
        """
        return Job(kind=kind, target_id=target_id, result=result)
