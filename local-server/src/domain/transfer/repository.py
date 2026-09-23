"""Persistence for import, export, synchronization, and backups."""

from datetime import datetime
from typing import Any, Literal, cast

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domain.tabs.visibility import exportable_tabs
from lib.time import utc_now
from models import Backup, Group, PropertySchema, Tab, Tag, Tombstone


class TransferRepository:
    """Read and stage transfer-owned records without committing."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session."""
        self.session = session

    async def backups(self) -> list[Backup]:
        """List backups newest first."""
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
        """Stage backup metadata."""
        self.session.add(backup)
        await self.session.flush()
        return backup

    async def transfer_rows(
        self, *, include_hidden: bool = True, now: datetime | None = None
    ) -> tuple[list[Tag], list[Group], list[Tab]]:
        """Load deterministic transfer rows."""
        tags = list((await self.session.scalars(select(Tag).order_by(func.lower(Tag.name)))).all())
        groups = list(
            (await self.session.scalars(select(Group).order_by(Group.position, Group.id))).all()
        )
        query = select(Tab).options(selectinload(Tab.tags)).order_by(Tab.position, Tab.id)
        if not include_hidden:
            if now is None:
                raise ValueError("now is required when hidden tabs are excluded")
            query = query.where(exportable_tabs(now))
        return tags, groups, list((await self.session.scalars(query)).unique())

    async def get_property_schema(self) -> PropertySchema | None:
        """Load the portable property schema."""
        return await self.session.get(PropertySchema, 1)

    async def replace_property_schema(self, properties: dict[str, Any]) -> PropertySchema:
        """Stage a complete property-schema replacement."""
        schema = await self.get_property_schema()
        if schema is None:
            schema = PropertySchema(id=1, properties=properties)
            self.session.add(schema)
        else:
            schema.properties = properties
            schema.updated_at = utc_now()
        return schema

    async def current_ids(self) -> tuple[set[str], set[str], set[str]]:
        """Load current tab, group, and casefolded tag IDs."""
        tabs = set((await self.session.scalars(select(Tab.id))).all())
        groups = set((await self.session.scalars(select(Group.id))).all())
        tags = {name.lower() for name in (await self.session.scalars(select(Tag.name))).all()}
        return tabs, groups, tags

    async def clear_library(self) -> None:
        """Stage deletion of every tab, group, and tag."""
        await self.session.execute(delete(Tab))
        await self.session.execute(delete(Group))
        await self.session.execute(delete(Tag))
        await self.session.flush()

    async def replace_group(self, group_id: str) -> None:
        """Delete one group and its assigned tabs before replacement."""
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
        """Load an imported tab with tags."""
        return cast(
            Tab | None,
            await self.session.scalar(
                select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
            ),
        )

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags."""
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
        """Stage a mapped ORM model."""
        self.session.add(model)
        await self.session.flush()

    @staticmethod
    async def apply_changes(model: object, changes: dict[str, object]) -> None:
        """Stage mapped field changes."""
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
