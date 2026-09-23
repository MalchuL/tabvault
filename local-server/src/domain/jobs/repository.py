"""Persistence for durable jobs."""

from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Job


class JobRepository:
    """Read and stage durable job rows without committing.

    Attributes:
        session (AsyncSession): Request-scoped session used to read or stage rows without committing.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session.
        """
        self.session = session

    async def find_active(self, kind: str, target_id: str | None = None) -> Job | None:
        """Find the newest active job of a kind.

        Args:
            kind (str): Kind of job or asset being created.
            target_id (str | None): Identifier of the job target, if any.

        Returns:
            Job | None: Matching job row, or None when absent.
        """
        filters = [Job.kind == kind, Job.status.in_(["pending", "running"])]
        if target_id is not None:
            filters.append(Job.target_id == target_id)
        return cast(
            Job | None,
            await self.session.scalar(select(Job).where(*filters).order_by(Job.created_at.desc())),
        )

    async def add(self, job: Job) -> Job:
        """Stage a new job.

        Args:
            job (Job): Background job row being converted or persisted.

        Returns:
            Job: Job row read or staged by this operation.
        """
        self.session.add(job)
        await self.session.flush()
        return job

    async def get(self, job_id: str) -> Job | None:
        """Load one job by ID.

        Args:
            job_id (str): Identifier of the background job.

        Returns:
            Job | None: Matching job row, or None when absent.
        """
        return await self.session.get(Job, job_id)

    async def reset_running(self) -> None:
        """Return interrupted jobs to pending state."""
        jobs = (await self.session.scalars(select(Job).where(Job.status == "running"))).all()
        for job in jobs:
            job.status = "pending"

    async def next_pending(self) -> Job | None:
        """Load the oldest pending job.

        Returns:
            Job | None: Matching job row, or None when absent.
        """
        return cast(
            Job | None,
            await self.session.scalar(
                select(Job).where(Job.status == "pending").order_by(Job.created_at)
            ),
        )

    @staticmethod
    def update(job: Job, **changes: object) -> None:
        """Stage changes to a job row.

        Args:
            job (Job): Background job row being converted or persisted.
            **changes (object): Job fields and values to stage.
        """
        for key, value in changes.items():
            setattr(job, key, value)
