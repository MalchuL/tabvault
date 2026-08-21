"""Persistence operations for system, transfer, preview, and worker use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, cast

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from models import (
    Asset,
    Backup,
    Group,
    HealthSchedule,
    IdempotencyRecord,
    Job,
    Preview,
    Tab,
    Tag,
    Tombstone,
)


class SystemRepository:
    """Provide all database operations for the system bounded context."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session."""
        self.session = session

    async def health_counts(self) -> tuple[int, int, int]:
        """Count active tabs, active groups, and tags."""
        tabs = int(
            await self.session.scalar(select(func.count(Tab.id)).where(Tab.archived.is_(False)))
            or 0
        )
        groups = int(
            await self.session.scalar(select(func.count(Group.id)).where(Group.archived.is_(False)))
            or 0
        )
        tags = int(await self.session.scalar(select(func.count(Tag.name))) or 0)
        return tabs, groups, tags

    async def search_tabs(self, group_id: str | None, tags: list[str]) -> list[Tab]:
        """Load active tabs matching search filters."""
        filters: list[ColumnElement[bool]] = [Tab.archived.is_(False)]
        if group_id:
            filters.append(Tab.group_id == group_id)
        for tag in tags:
            filters.append(Tab.tags.any(func.lower(Tag.name) == tag.lower()))
        return list(
            (
                await self.session.scalars(
                    select(Tab).where(*filters).options(selectinload(Tab.tags))
                )
            ).unique()
        )

    async def find_active_job(self, kind: str, target_id: str | None = None) -> Job | None:
        """Find the newest pending or running job of one kind."""
        filters = [Job.kind == kind, Job.status.in_(["pending", "running"])]
        if target_id is not None:
            filters.append(Job.target_id == target_id)
        return cast(
            Job | None,
            await self.session.scalar(select(Job).where(*filters).order_by(Job.created_at.desc())),
        )

    async def add_job(self, job: Job) -> Job:
        """Persist a new background job."""
        self.session.add(job)
        await self.session.flush()
        return job

    async def get_job(self, job_id: str) -> Job | None:
        """Load a background job by ID."""
        return await self.session.get(Job, job_id)

    async def reset_running_jobs(self) -> None:
        """Return interrupted running jobs to pending state."""
        jobs = (await self.session.scalars(select(Job).where(Job.status == "running"))).all()
        for job in jobs:
            job.status = "pending"

    async def next_pending_job(self) -> Job | None:
        """Load the oldest pending background job."""
        return cast(
            Job | None,
            await self.session.scalar(
                select(Job).where(Job.status == "pending").order_by(Job.created_at)
            ),
        )

    async def update_job(self, job: Job, **changes: object) -> None:
        """Apply state changes to a background job."""
        for key, value in changes.items():
            setattr(job, key, value)

    async def get_schedule(self) -> HealthSchedule:
        """Load or initialize the singleton health schedule."""
        schedule = await self.session.get(HealthSchedule, 1)
        if schedule is None:
            schedule = HealthSchedule(id=1)
            self.session.add(schedule)
            await self.session.flush()
        return schedule

    async def apply_schedule(self, schedule: HealthSchedule, **changes: object) -> None:
        """Apply changes to the singleton health schedule."""
        for key, value in changes.items():
            setattr(schedule, key, value)

    async def get_tab(self, tab_id: str) -> Tab | None:
        """Load a tab by ID."""
        return await self.session.get(Tab, tab_id)

    async def active_tabs(self) -> list[Tab]:
        """List active tabs for vector indexing."""
        return list((await self.session.scalars(select(Tab).where(Tab.archived.is_(False)))).all())

    async def get_preview(self, tab_id: str) -> Preview | None:
        """Load preview state for a tab."""
        return await self.session.get(Preview, tab_id)

    async def save_preview(self, preview: Preview) -> Preview:
        """Persist a new preview row."""
        self.session.add(preview)
        await self.session.flush()
        return preview

    async def get_asset(self, asset_id: str) -> Asset | None:
        """Load an asset by ID."""
        return await self.session.get(Asset, asset_id)

    async def find_asset_checksum(self, checksum: str) -> Asset | None:
        """Find an asset by content checksum."""
        return cast(
            Asset | None,
            await self.session.scalar(select(Asset).where(Asset.checksum == checksum)),
        )

    async def save_asset(self, asset: Asset) -> Asset:
        """Persist a captured asset."""
        self.session.add(asset)
        await self.session.flush()
        return asset

    async def backups(self) -> list[Backup]:
        """List backups from newest to oldest."""
        return list(
            (await self.session.scalars(select(Backup).order_by(Backup.created_at.desc()))).all()
        )

    async def get_backup(self, backup_id: str) -> Backup | None:
        """Load a backup by ID."""
        return await self.session.get(Backup, backup_id)

    async def latest_backup(self, reason: str) -> Backup | None:
        """Find the newest backup for a reason."""
        return cast(
            Backup | None,
            await self.session.scalar(
                select(Backup).where(Backup.reason == reason).order_by(Backup.created_at.desc())
            ),
        )

    async def save_backup(self, backup: Backup) -> Backup:
        """Persist backup metadata."""
        self.session.add(backup)
        await self.session.flush()
        return backup

    async def transfer_rows(self) -> tuple[list[Tag], list[Group], list[Tab]]:
        """Load the complete library in deterministic export order."""
        tags = list((await self.session.scalars(select(Tag).order_by(func.lower(Tag.name)))).all())
        groups = list(
            (await self.session.scalars(select(Group).order_by(Group.position, Group.id))).all()
        )
        tabs = list(
            (
                await self.session.scalars(
                    select(Tab).options(selectinload(Tab.tags)).order_by(Tab.position, Tab.id)
                )
            ).unique()
        )
        return tags, groups, tabs

    async def current_ids(self) -> tuple[set[str], set[str], set[str]]:
        """Load current tab IDs, group IDs, and casefolded tag names."""
        tabs = set((await self.session.scalars(select(Tab.id))).all())
        groups = set((await self.session.scalars(select(Group.id))).all())
        tags = {name.lower() for name in (await self.session.scalars(select(Tag.name))).all()}
        return tabs, groups, tags

    async def clear_library(self) -> None:
        """Delete every tab, group, and tag."""
        await self.session.execute(delete(Tab))
        await self.session.execute(delete(Group))
        await self.session.execute(delete(Tag))
        await self.session.flush()

    async def replace_group(self, group_id: str) -> None:
        """Delete one group and its directly assigned tabs."""
        await self.session.execute(delete(Tab).where(Tab.group_id == group_id))
        await self.session.execute(delete(Group).where(Group.id == group_id))
        await self.session.flush()

    async def get_tag(self, name: str) -> Tag | None:
        """Load a tag case-insensitively."""
        return cast(
            Tag | None,
            await self.session.scalar(select(Tag).where(func.lower(Tag.name) == name.lower())),
        )

    async def get_group(self, group_id: str) -> Group | None:
        """Load a group by ID."""
        return await self.session.get(Group, group_id)

    async def get_transfer_tab(self, tab_id: str) -> Tab | None:
        """Load a tab and its tags for import merging."""
        return cast(
            Tab | None,
            await self.session.scalar(
                select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
            ),
        )

    async def find_tab_url(self, normalized_url: str) -> Tab | None:
        """Find the oldest tab matching a normalized URL."""
        return cast(
            Tab | None,
            await self.session.scalar(
                select(Tab)
                .where(Tab.normalized_url == normalized_url)
                .order_by(Tab.created_at, Tab.id)
                .options(selectinload(Tab.tags))
            ),
        )

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags for an imported tab."""
        result: list[Tag] = []
        for name in dict.fromkeys(value.strip() for value in names if value.strip()):
            tag = await self.get_tag(name)
            if tag is None:
                tag = Tag(name=name, description=None)
                self.session.add(tag)
                await self.session.flush()
            result.append(tag)
        return result

    async def save_model(self, model: object) -> None:
        """Persist a mapped ORM model and populate generated fields."""
        self.session.add(model)
        await self.session.flush()

    async def apply_changes(self, model: object, changes: dict[str, object]) -> None:
        """Apply mapped fields to an ORM model."""
        for key, value in changes.items():
            setattr(model, key, value)

    async def tombstone_exists(self, entity_type: Literal["group", "tab"], entity_id: str) -> bool:
        """Check whether an imported entity was permanently deleted."""
        return bool(
            await self.session.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == entity_type,
                    Tombstone.entity_id == entity_id,
                )
            )
        )

    async def purge_idempotency(self, now: datetime) -> None:
        """Delete expired idempotency records."""
        await self.session.execute(
            delete(IdempotencyRecord).where(IdempotencyRecord.expires_at < now)
        )

    async def get_idempotency(self, key: str) -> IdempotencyRecord | None:
        """Load an idempotency record by key."""
        return await self.session.get(IdempotencyRecord, key)

    async def save_idempotency(self, record: IdempotencyRecord) -> None:
        """Persist an idempotency record."""
        self.session.add(record)
