"""Persistence operations for system, transfer, preview, and worker use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, cast

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from domain.tabs.visibility import exportable_tabs, visible_tabs
from models import (
    Asset,
    Backup,
    Group,
    HealthSchedule,
    Job,
    Preview,
    Tab,
    Tag,
    Tombstone,
)


class SystemRepository:
    """Provide all database operations for the system bounded context.

    This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
    session. It reads or stages database state without committing; the calling service owns the
    surrounding transaction.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        self.session = session

    async def health_counts(self, now: datetime) -> tuple[int, int, int]:
        """Count visible active tabs, Groups, and tags.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            tuple[int, int, int]: Result produced by the operation described above.
        """
        tabs = int(
            await self.session.scalar(select(func.count(Tab.id)).where(visible_tabs(now))) or 0
        )
        groups = int(await self.session.scalar(select(func.count(Group.id))) or 0)
        tags = int(await self.session.scalar(select(func.count(Tag.name))) or 0)
        return tabs, groups, tags

    async def search_tabs(self, group_id: str | None, tags: list[str], now: datetime) -> list[Tab]:
        """Load visible active tabs matching search filters.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group_id (str | None): Stable identifier of the group targeted by the operation.
            tags (list[str]): Tags value consumed by this operation.
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            list[Tab]: Result produced by the operation described above.
        """
        filters: list[ColumnElement[bool]] = [visible_tabs(now)]
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
        """Find the newest pending or running job of one kind.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            kind (str): Kind value consumed by this operation.
            target_id (str | None): Stable identifier of the target targeted by the operation.

        Returns:
            Job | None: Result produced by the operation described above.
        """
        filters = [Job.kind == kind, Job.status.in_(["pending", "running"])]
        if target_id is not None:
            filters.append(Job.target_id == target_id)
        return cast(
            Job | None,
            await self.session.scalar(select(Job).where(*filters).order_by(Job.created_at.desc())),
        )

    async def add_job(self, job: Job) -> Job:
        """Persist a new background job.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            job (Job): Job value consumed by this operation.

        Returns:
            Job: Result produced by the operation described above.
        """
        self.session.add(job)
        await self.session.flush()
        return job

    async def get_job(self, job_id: str) -> Job | None:
        """Load a background job by ID.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            job_id (str): Stable identifier of the job targeted by the operation.

        Returns:
            Job | None: Result produced by the operation described above.
        """
        return await self.session.get(Job, job_id)

    async def reset_running_jobs(self) -> None:
        """Return interrupted running jobs to pending state.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.
        """
        jobs = (await self.session.scalars(select(Job).where(Job.status == "running"))).all()
        for job in jobs:
            job.status = "pending"

    async def next_pending_job(self) -> Job | None:
        """Load the oldest pending background job.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Returns:
            Job | None: Result produced by the operation described above.
        """
        return cast(
            Job | None,
            await self.session.scalar(
                select(Job).where(Job.status == "pending").order_by(Job.created_at)
            ),
        )

    async def update_job(self, job: Job, **changes: object) -> None:
        """Apply state changes to a background job.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            job (Job): Job value consumed by this operation.
            changes (object): Changes value consumed by this operation.
        """
        for key, value in changes.items():
            setattr(job, key, value)

    async def get_schedule(self) -> HealthSchedule:
        """Load or initialize the singleton health schedule.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Returns:
            HealthSchedule: Result produced by the operation described above.
        """
        schedule = await self.session.get(HealthSchedule, 1)
        if schedule is None:
            schedule = HealthSchedule(id=1)
            self.session.add(schedule)
            await self.session.flush()
        return schedule

    async def apply_schedule(self, schedule: HealthSchedule, **changes: object) -> None:
        """Apply changes to the singleton health schedule.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            schedule (HealthSchedule): Schedule value consumed by this operation.
            changes (object): Changes value consumed by this operation.
        """
        for key, value in changes.items():
            setattr(schedule, key, value)

    async def get_tab(self, tab_id: str) -> Tab | None:
        """Load a tab by ID.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            Tab | None: Result produced by the operation described above.
        """
        return await self.session.get(Tab, tab_id)

    async def active_tabs(self, now: datetime) -> list[Tab]:
        """List visible active tabs for vector indexing.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            now (datetime): Current absolute UTC instant used for consistent visibility decisions.

        Returns:
            list[Tab]: Result produced by the operation described above.
        """
        return list((await self.session.scalars(select(Tab).where(visible_tabs(now)))).all())

    async def get_preview(self, tab_id: str) -> Preview | None:
        """Load preview state for a tab.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            Preview | None: Result produced by the operation described above.
        """
        return await self.session.get(Preview, tab_id)

    async def save_preview(self, preview: Preview) -> Preview:
        """Persist a new preview row.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            preview (Preview): Preview value consumed by this operation.

        Returns:
            Preview: Result produced by the operation described above.
        """
        self.session.add(preview)
        await self.session.flush()
        return preview

    async def get_asset(self, asset_id: str) -> Asset | None:
        """Load an asset by ID.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            asset_id (str): Stable identifier of the asset targeted by the operation.

        Returns:
            Asset | None: Result produced by the operation described above.
        """
        return await self.session.get(Asset, asset_id)

    async def find_asset_checksum(self, checksum: str) -> Asset | None:
        """Find an asset by content checksum.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            checksum (str): Checksum value consumed by this operation.

        Returns:
            Asset | None: Result produced by the operation described above.
        """
        return cast(
            Asset | None,
            await self.session.scalar(select(Asset).where(Asset.checksum == checksum)),
        )

    async def save_asset(self, asset: Asset) -> Asset:
        """Persist a captured asset.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            asset (Asset): Asset value consumed by this operation.

        Returns:
            Asset: Result produced by the operation described above.
        """
        self.session.add(asset)
        await self.session.flush()
        return asset

    async def backups(self) -> list[Backup]:
        """List backups from newest to oldest.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Returns:
            list[Backup]: Result produced by the operation described above.
        """
        return list(
            (await self.session.scalars(select(Backup).order_by(Backup.created_at.desc()))).all()
        )

    async def get_backup(self, backup_id: str) -> Backup | None:
        """Load a backup by ID.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            backup_id (str): Stable identifier of the backup targeted by the operation.

        Returns:
            Backup | None: Result produced by the operation described above.
        """
        return await self.session.get(Backup, backup_id)

    async def latest_backup(self, reason: str) -> Backup | None:
        """Find the newest backup for a reason.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            reason (str): Stable reason recorded for the operation.

        Returns:
            Backup | None: Result produced by the operation described above.
        """
        return cast(
            Backup | None,
            await self.session.scalar(
                select(Backup).where(Backup.reason == reason).order_by(Backup.created_at.desc())
            ),
        )

    async def save_backup(self, backup: Backup) -> Backup:
        """Persist backup metadata.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            backup (Backup): Backup value consumed by this operation.

        Returns:
            Backup: Result produced by the operation described above.
        """
        self.session.add(backup)
        await self.session.flush()
        return backup

    async def transfer_rows(
        self, *, include_hidden: bool = True, now: datetime | None = None
    ) -> tuple[list[Tag], list[Group], list[Tab]]:
        """Load deterministic transfer rows, optionally omitting active hidden tabs.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            include_hidden (bool): Whether returned data includes hidden.
            now (datetime | None): Current absolute UTC instant used for consistent visibility
                decisions.

        Returns:
            tuple[list[Tag], list[Group], list[Tab]]: Result produced by the operation described
                above.

        Raises:
            ValueError: Propagated when its documented validation or operation condition occurs.
        """
        tags = list((await self.session.scalars(select(Tag).order_by(func.lower(Tag.name)))).all())
        groups = list(
            (await self.session.scalars(select(Group).order_by(Group.position, Group.id))).all()
        )
        tab_query = select(Tab).options(selectinload(Tab.tags)).order_by(Tab.position, Tab.id)
        if not include_hidden:
            if now is None:
                raise ValueError("now is required when hidden tabs are excluded")
            tab_query = tab_query.where(exportable_tabs(now))
        tabs = list((await self.session.scalars(tab_query)).unique())
        return tags, groups, tabs

    async def current_ids(self) -> tuple[set[str], set[str], set[str]]:
        """Load current tab IDs, group IDs, and casefolded tag names.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Returns:
            tuple[set[str], set[str], set[str]]: Result produced by the operation described above.
        """
        tabs = set((await self.session.scalars(select(Tab.id))).all())
        groups = set((await self.session.scalars(select(Group.id))).all())
        tags = {name.lower() for name in (await self.session.scalars(select(Tag.name))).all()}
        return tabs, groups, tags

    async def clear_library(self) -> None:
        """Delete every tab, group, and tag.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.
        """
        await self.session.execute(delete(Tab))
        await self.session.execute(delete(Group))
        await self.session.execute(delete(Tag))
        await self.session.flush()

    async def replace_group(self, group_id: str) -> None:
        """Delete one group and its directly assigned tabs.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.
        """
        await self.session.execute(delete(Tab).where(Tab.group_id == group_id))
        await self.session.execute(delete(Group).where(Group.id == group_id))
        await self.session.flush()

    async def get_tag(self, name: str) -> Tag | None:
        """Load a tag case-insensitively.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            name (str): Human-readable name used by the operation.

        Returns:
            Tag | None: Result produced by the operation described above.
        """
        return cast(
            Tag | None,
            await self.session.scalar(select(Tag).where(func.lower(Tag.name) == name.lower())),
        )

    async def get_group(self, group_id: str) -> Group | None:
        """Load a group by ID.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.

        Returns:
            Group | None: Result produced by the operation described above.
        """
        return await self.session.get(Group, group_id)

    async def get_transfer_tab(self, tab_id: str) -> Tab | None:
        """Load a tab and its tags for import merging.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            Tab | None: Result produced by the operation described above.
        """
        return cast(
            Tab | None,
            await self.session.scalar(
                select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
            ),
        )

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags for an imported tab.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            names (list[str]): Names value consumed by this operation.

        Returns:
            list[Tag]: Result produced by the operation described above.
        """
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
        """Persist a mapped ORM model and populate generated fields.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            model (object): Model value consumed by this operation.
        """
        self.session.add(model)
        await self.session.flush()

    async def apply_changes(self, model: object, changes: dict[str, object]) -> None:
        """Apply mapped fields to an ORM model.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            model (object): Model value consumed by this operation.
            changes (dict[str, object]): Changes value consumed by this operation.
        """
        for key, value in changes.items():
            setattr(model, key, value)

    async def tombstone_exists(self, entity_type: Literal["group", "tab"], entity_id: str) -> bool:
        """Check whether an imported entity was permanently deleted.

        This persistence-layer operation executes through the request-scoped asynchronous SQLAlchemy
        session. It reads or stages database state without committing; the calling service owns the
        surrounding transaction.

        Args:
            entity_type (Literal["group", "tab"]): Entity type value consumed by this operation.
            entity_id (str): Stable identifier of the entity targeted by the operation.

        Returns:
            bool: Result produced by the operation described above.
        """
        return bool(
            await self.session.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == entity_type,
                    Tombstone.entity_id == entity_id,
                )
            )
        )
