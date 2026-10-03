"""Persistence for import, export, synchronization, and backups."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, cast

import aiosqlite
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domain.tabs.visibility import exportable_tabs
from lib.model_changes import apply_model_changes
from models import Backup, Base, Group, LibraryMetadata, PropertyDefinition, Tab, Tag, Tombstone

from .error import DatabaseBackupUnsupportedError


class TransferRepository:
    """Read and stage transfer-owned records without committing.

    Attributes:
        session (AsyncSession): Request-scoped session used to read or stage rows without committing.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session.
        """
        self.session = session

    async def copy_database(self, destination: Path) -> None:
        """Copy committed SQLite data, including WAL pages, into a standalone database.

        Uses the active session's database location and SQLite's online backup API.
        Separate connections keep backup work off the event loop and leave request
        transactions unchanged. The source is opened read-only to avoid creating an
        empty database if the configured file is missing.

        Args:
            destination (Path): Reserved output file owned and cleaned up by the service.

        Raises:
            DatabaseBackupUnsupportedError: The active database is not file-backed SQLite.
            sqlite3.Error: SQLite cannot open or copy either database.
        """
        url = self.session.get_bind().engine.url
        if url.get_backend_name() != "sqlite" or url.database in {None, "", ":memory:"}:
            raise DatabaseBackupUnsupportedError("Database backups require file-backed SQLite")
        source_uri = Path(url.database).resolve().as_uri() + "?mode=ro"
        async with (
            aiosqlite.connect(source_uri, uri=True) as source,
            aiosqlite.connect(destination) as target,
        ):
            await source.backup(target)

    async def backups(self) -> list[Backup]:
        """List backups newest first.

        Returns:
            list[Backup]: Matching records in display order.
        """
        return list(
            (await self.session.scalars(select(Backup).order_by(Backup.created_at.desc()))).all()
        )

    async def get_backup(self, backup_id: str) -> Backup | None:
        """Load a backup by ID.

        Args:
            backup_id (str): Identifier of the backup to restore.

        Returns:
            Backup | None: Backup with the requested ID, or None if absent.
        """
        return await self.session.get(Backup, backup_id)

    async def expired_backups(self, directory: Path, keep: int) -> list[tuple[Path, str | None]]:
        """Find completed backups beyond a shared newest-first retention limit.

        Includes registered JSON snapshots and SQLite copies with the exact
        generated filename format, directly inside the backup directory. Temporary
        files, unrelated files, symlinks, and the active database are excluded.
        File modification times order both formats consistently.

        Args:
            directory (Path): Directory containing manual database copies.
            keep (int): Number of completed backups to retain across both formats.

        Returns:
            list[tuple[Path, str | None]]: Expired absolute paths paired with JSON
                metadata IDs, or None for unregistered SQLite copies.
        """
        directory = directory.resolve()
        candidates: dict[Path, str | None] = {}
        for backup in await self.backups():
            path = Path(backup.path)
            if (
                path.parent.resolve() == directory
                and path.name == f"{backup.id}.json"
                and not path.is_symlink()
            ):
                candidates[path.resolve()] = backup.id
        for path in directory.glob("backup-*.sqlite3"):
            if (
                re.fullmatch(r"backup-[0-9]{8}T[0-9]{12}Z-[0-9a-f]{32}\.sqlite3", path.name)
                and not path.is_symlink()
            ):
                candidates[path.resolve()] = None
        database = self.session.get_bind().engine.url.database
        active = Path(database).resolve() if database else None
        completed = [path for path in candidates if path != active and path.is_file()]
        completed.sort(key=lambda path: (path.stat().st_mtime_ns, path.name), reverse=True)
        return [(path, candidates[path]) for path in completed[keep:]]

    async def delete_backup_records(self, backup_ids: list[str]) -> None:
        """Stage removal of expired JSON backup metadata without committing.

        Args:
            backup_ids (list[str]): IDs whose files the service will remove after commit.
        """
        await self.session.execute(delete(Backup).where(Backup.id.in_(backup_ids)))

    async def latest_backup(self, reason: str) -> Backup | None:
        """Find the newest backup for a reason.

        Args:
            reason (str): Reason recorded for the backup.

        Returns:
            Backup | None: Newest backup for the reason, or None if absent.
        """
        return cast(
            Backup | None,
            await self.session.scalar(
                select(Backup).where(Backup.reason == reason).order_by(Backup.created_at.desc())
            ),
        )

    async def save_backup(self, backup: Backup) -> Backup:
        """Stage backup metadata.

        Args:
            backup (Backup): New backup metadata row to stage.

        Returns:
            Backup: Staged backup row after its generated fields are flushed.
        """
        self.session.add(backup)
        await self.session.flush()
        return backup

    async def transfer_rows(
        self, *, include_hidden: bool = True, now: datetime | None = None
    ) -> tuple[list[Tag], list[Group], list[Tab]]:
        """Load deterministic transfer rows.

        Args:
            include_hidden (bool): Whether hidden active tabs belong in the result.
            now (datetime | None): Current UTC instant used for consistent visibility decisions.

        Returns:
            tuple[list[Tag], list[Group], list[Tab]]: Tags, groups, and tabs in stable export order.

        Raises:
            ValueError: Hidden tabs are excluded without a reference instant.
        """
        tags = list((await self.session.scalars(select(Tag).order_by(func.lower(Tag.name)))).all())
        groups = list(
            (
                await self.session.scalars(
                    select(Group).order_by(Group.__table__.c._position, Group.id)
                )
            ).all()
        )
        query = (
            select(Tab)
            .execution_options(populate_existing=True)
            .options(selectinload(Tab.tags))
            .order_by(Tab.__table__.c._position, Tab.id)
        )
        if not include_hidden:
            if now is None:
                raise ValueError("now is required when hidden tabs are excluded")
            query = query.where(exportable_tabs(now))
        return tags, groups, list((await self.session.scalars(query)).unique())

    async def property_definitions(self) -> dict[str, Any]:
        """Return the current name-to-definition map without creating rows."""
        rows = (await self.session.scalars(select(PropertyDefinition))).all()
        return {row.name: row.definition for row in rows}

    async def replace_property_schema(
        self, properties: dict[str, Any], *, replace: bool = False
    ) -> None:
        """Add missing definitions on merge; replace definitions only with explicit replacement.

        Keeping existing meanings matches browser-local merge and prevents an imported
        default or type from silently changing values already stored in the library.

        Args:
            properties (dict[str, Any]): Portable definitions keyed by name.
            replace (bool): Whether this is an authoritative replacement.
        """
        from domain.custom_properties.dto import PropertyDefinitionDTO

        if replace:
            await self.session.execute(delete(PropertyDefinition))
        for name, definition in properties.items():
            dto = PropertyDefinitionDTO.model_validate({"name": name, **definition})
            row = await self.session.get(PropertyDefinition, name)
            if row is None:
                self.session.add(
                    PropertyDefinition(name=name, definition=dto.model_dump(exclude={"name"}))
                )
        await self.session.flush()

    async def current_ids(self) -> tuple[set[str], set[str], set[str]]:
        """Load current tab, group, and casefolded tag IDs.

        Returns:
            tuple[set[str], set[str], set[str]]: Current tab IDs, group IDs, and lowercase tag names.
        """
        tabs = set((await self.session.scalars(select(Tab.id))).all())
        groups = set((await self.session.scalars(select(Group.id))).all())
        tags = {name.lower() for name in (await self.session.scalars(select(Tag.name))).all()}
        return tabs, groups, tags

    async def clear_library(self) -> None:
        """Stage deletion of every tab, group, and tag."""
        await self.session.execute(delete(Tab))
        await self.session.execute(delete(Group))
        await self.session.execute(delete(Tag))
        await self.session.execute(delete(PropertyDefinition))
        await self.session.execute(delete(Tombstone))
        metadata = await self.session.get(LibraryMetadata, 1)
        if metadata is not None:
            metadata.generation = str(uuid.uuid4())
        await self.session.flush()

    async def replace_group(self, group_id: str) -> None:
        """Delete one group and its assigned tabs before replacement.

        Args:
            group_id (str): Collection ID or null for Unassigned.
        """
        metadata = await self.session.get(LibraryMetadata, 1)
        if metadata is not None:
            metadata.generation = str(uuid.uuid4())
        await self.session.execute(delete(Tab).where(Tab.__table__.c._group_id == group_id))
        await self.session.execute(delete(Group).where(Group.id == group_id))
        await self.session.flush()

    async def get_tag(self, name: str) -> Tag | None:
        """Load a tag case-insensitively.

        Args:
            name (str): Name identifying the tag or other target record.

        Returns:
            Tag | None: Matching tag row, or None when absent.
        """
        return cast(
            Tag | None,
            await self.session.scalar(select(Tag).where(func.lower(Tag.name) == name.lower())),
        )

    async def get_group(self, group_id: str) -> Group | None:
        """Load a group by ID.

        Args:
            group_id (str): Collection ID or null for Unassigned.

        Returns:
            Group | None: Group with the requested ID, or None if absent.
        """
        return await self.session.get(Group, group_id)

    async def get_transfer_tab(self, tab_id: str) -> Tab | None:
        """Load an imported tab with tags.

        Args:
            tab_id (str): Stable identifier of the saved tab.

        Returns:
            Tab | None: Matching tab row, or None when absent.
        """
        return cast(
            Tab | None,
            await self.session.scalar(
                select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
            ),
        )

    async def resolve_tags(self, names: list[str]) -> list[Tag]:
        """Load or create case-insensitive tags.

        Args:
            names (list[str]): Tag names to resolve or filter by.

        Returns:
            list[Tag]: Matching records in display order.
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
        """Stage a mapped ORM model.

        Args:
            model (object): ORM row receiving validated changes.
        """
        self.session.add(model)
        await self.session.flush()

    @staticmethod
    async def apply_changes(model: Base, changes: dict[str, object]) -> None:
        """Stage mapped field changes.

        Args:
            model (object): ORM row receiving validated changes.
            changes (dict[str, object]): Validated field values to apply to the row.
        """
        apply_model_changes(model, changes)

    async def tombstone_exists(
        self, entity_type: Literal["group", "tab", "tag", "property"], entity_id: str
    ) -> bool:
        """Check whether an imported entity was permanently deleted.

        Args:
            entity_type (Literal['group', 'tab']): Deleted entity type recorded by the
                tombstone.
            entity_id (str): Identifier of the deleted entity.

        Returns:
            bool: True when a tombstone already blocks this entity's restoration.
        """
        return bool(
            await self.session.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == entity_type,
                    Tombstone.entity_id == entity_id,
                )
            )
        )
