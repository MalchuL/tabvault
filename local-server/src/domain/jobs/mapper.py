"""Mappings for durable jobs."""

from typing import Any

from models import Job

from .dto import JobDTO


class JobMapper:
    """Map durable job rows and creation values."""

    @staticmethod
    def to_dto(job: Job) -> JobDTO:
        """Convert a job row to its wire DTO."""
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
        """Create a pending job row."""
        return Job(kind=kind, target_id=target_id, result=result)
