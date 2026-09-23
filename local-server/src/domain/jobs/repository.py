"""Persistence for durable jobs."""

from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Job


class JobRepository:
    """Read and stage durable job rows without committing."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session."""
        self.session = session

    async def find_active(self, kind: str, target_id: str | None = None) -> Job | None:
        """Find the newest active job of a kind."""
        filters = [Job.kind == kind, Job.status.in_(["pending", "running"])]
        if target_id is not None:
            filters.append(Job.target_id == target_id)
        return cast(
            Job | None,
            await self.session.scalar(select(Job).where(*filters).order_by(Job.created_at.desc())),
        )

    async def add(self, job: Job) -> Job:
        """Stage a new job."""
        self.session.add(job)
        await self.session.flush()
        return job

    async def get(self, job_id: str) -> Job | None:
        """Load one job by ID."""
        return await self.session.get(Job, job_id)

    async def reset_running(self) -> None:
        """Return interrupted jobs to pending state."""
        jobs = (await self.session.scalars(select(Job).where(Job.status == "running"))).all()
        for job in jobs:
            job.status = "pending"

    async def next_pending(self) -> Job | None:
        """Load the oldest pending job."""
        return cast(
            Job | None,
            await self.session.scalar(
                select(Job).where(Job.status == "pending").order_by(Job.created_at)
            ),
        )

    @staticmethod
    def update(job: Job, **changes: object) -> None:
        """Stage changes to a job row."""
        for key, value in changes.items():
            setattr(job, key, value)
