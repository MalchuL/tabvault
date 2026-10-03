"""Portable library import, export, validation, and backup use cases."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from lib.responses import IssueDTO, WarningDTO, issue
from lib.time import stored_utc, utc_now

from .document import markdown_import, validate_document
from .dto import (
    BackupDTO,
    DatabaseBackupDTO,
    ExportFields,
    ImportApplyDataDTO,
    ImportApplyResultDTO,
    ImportCountsDTO,
    ImportMode,
    ImportValidationDTO,
    LibraryClearDTO,
    MinimalTransferDocumentDTO,
    MinimalTransferTabDTO,
    TransferDocumentDTO,
    TransferExportDTO,
    TransferFormat,
)
from .error import BackupNotFoundError, DatabaseBackupDisabledError
from .mapper import TransferMapper
from .repository import TransferRepository


class TransferService:
    """Own transfer transactions and backup snapshots for the portable library.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        settings (Settings): Validated process settings shared for this instance lifetime.
        repository (TransferRepository): Persistence adapter retained for this service instance.
        mapper (TransferMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        repository: TransferRepository,
    ) -> None:
        """Keep the session and repositories used by one transfer request.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session.
            settings (Settings): Validated runtime settings for this operation.
            repository (TransferRepository): Persistence adapter used by this service.
        """
        self.db = db
        self.settings = settings
        self.repository = repository
        self.mapper = TransferMapper()

    async def document(self, *, include_hidden: bool = True) -> TransferDocumentDTO:
        """Build a portable document; public exports omit currently hidden records.

        Args:
            include_hidden (bool): Whether hidden active tabs belong in the result.

        Returns:
            TransferDocumentDTO: Portable library document in schema v5.
        """
        tags, groups, tabs = await self.repository.transfer_rows(
            include_hidden=include_hidden,
            now=utc_now() if not include_hidden else None,
        )
        schema = await self.repository.property_definitions()
        return TransferDocumentDTO.model_validate(
            {
                "exported_at": utc_now(),
                "property_schema": schema,
                "library": {
                    "tags": [self.mapper.tag_to_dto(tag) for tag in tags],
                    "groups": [self.mapper.group_to_dto(group) for group in groups],
                    "tabs": [self.mapper.tab_to_dto(tab) for tab in tabs],
                },
            }
        )

    async def create_database_backup(self) -> DatabaseBackupDTO:
        """Create a manual SQLite copy and return its absolute server-side path.

        Copies committed data without modifying the live library or registering a
        portable JSON snapshot. Each request reserves a unique, private file under
        the data directory's backups folder; failed copies are removed. After a
        successful copy, retention keeps the newest 30 backups across both formats.

        Returns:
            DatabaseBackupDTO: Absolute path to the completed standalone database.

        Raises:
            DatabaseBackupDisabledError: Debug mode or manual database backups are disabled.
            DatabaseBackupUnsupportedError: The active database is not file-backed SQLite.
            OSError: The backup directory or file cannot be created or removed.
            sqlite3.Error: SQLite cannot complete the database copy.
        """
        if not self.settings.debug.enabled or not self.settings.debug.database_backup_enabled:
            raise DatabaseBackupDisabledError(
                "Database backups are disabled by server configuration"
            )
        directory = (self.settings.storage.data_dir / "backups").resolve()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"backup-{utc_now():%Y%m%dT%H%M%S%fZ}-{uuid.uuid4().hex}.sqlite3"
        temporary = path.with_suffix(".tmp")
        temporary.touch(mode=0o600, exist_ok=False)
        try:
            await self.repository.copy_database(temporary)
            temporary.replace(path)
        except BaseException:
            # A failed or cancelled copy must not leave a file that looks like a usable backup.
            temporary.unlink(missing_ok=True)
            raise
        await self.prune_backups()
        return DatabaseBackupDTO(path=str(path))

    async def prune_backups(self) -> None:
        """Retain the newest 30 completed backups across JSON and SQLite formats.

        Call only after a new backup and its owning transaction have succeeded.
        Commits expired JSON metadata removal before deleting its files, so a
        rollback cannot leave registered snapshots pointing at files removed here.
        No library records are changed; temporary files and the live database stay
        untouched. Startup also calls this to prune existing surplus backups.

        Raises:
            OSError: An expired backup cannot be deleted.
            SQLAlchemyError: Expired JSON metadata cannot be deleted or committed.
        """
        expired = await self.repository.expired_backups(
            self.settings.storage.data_dir / "backups", 30
        )
        backup_ids = [backup_id for _, backup_id in expired if backup_id is not None]
        if backup_ids:
            await self.repository.delete_backup_records(backup_ids)
            await self.db.commit()
        for path, _ in expired:
            path.unlink(missing_ok=True)

    async def create_backup(self, reason: str) -> BackupDTO:
        """Write a complete backup before registering its file in the database.

        The caller owns the transaction and prunes old backups after committing,
        so a failed replacement cannot remove existing recovery snapshots.

        Args:
            reason (str): Reason recorded for the backup.

        Returns:
            BackupDTO: Metadata for the newly created backup.
        """
        directory = self.settings.storage.data_dir / "backups"
        directory.mkdir(parents=True, exist_ok=True)
        backup_id = str(uuid.uuid4())
        path = directory / f"{backup_id}.json"
        document = await self.document()
        raw = json.dumps(
            document.model_dump(mode="json", by_alias=True), ensure_ascii=False, indent=2
        ).encode()
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(raw)
        temporary.replace(path)
        backup = self.mapper.backup(backup_id, path, reason, len(raw))
        await self.repository.save_backup(backup)
        return self.mapper.backup_to_dto(backup)

    async def export(
        self,
        format: TransferFormat,
        scope: str,
        fields: ExportFields,
    ) -> TransferExportDTO:
        """Export visible records, optionally limited to a group or tag.

        Args:
            format (TransferFormat): Requested import or export format.
            scope (str): Subset of library records to import or export.
            fields (ExportFields): Requested response fields for a projection.

        Returns:
            TransferExportDTO: Serialized export content and media type.
        """
        document = await self.document(include_hidden=False)
        if scope.startswith("group:"):
            group_id = scope.split(":", 1)[1]
            document.library.groups = [
                group for group in document.library.groups if group.id == group_id
            ]
            document.library.tabs = [
                tab for tab in document.library.tabs if tab.placement.group_id == group_id
            ]
        elif scope.startswith("tag:"):
            name = scope.split(":", 1)[1]
            document.library.tabs = [
                tab for tab in document.library.tabs if name in tab.annotations.tags
            ]
        content: TransferDocumentDTO | MinimalTransferDocumentDTO = document
        if fields == "minimal":
            content = MinimalTransferDocumentDTO.model_validate(
                {
                    "exported_at": document.exported_at,
                    "property_schema": document.property_schema,
                    "library": {
                        "tags": document.library.tags,
                        "groups": document.library.groups,
                        "tabs": [
                            MinimalTransferTabDTO.model_validate(
                                {
                                    "id": tab.id,
                                    "content": {
                                        "url": tab.content.url,
                                        "title": tab.content.title,
                                    },
                                    "placement": {"group_id": tab.placement.group_id},
                                    "annotations": {"tags": tab.annotations.tags},
                                }
                            )
                            for tab in document.library.tabs
                        ],
                    },
                }
            )
        if format == "json":
            return TransferExportDTO(content=content, media_type="application/json")
        lines: list[str] = [
            "  propertySchema: " + json.dumps(document.property_schema, ensure_ascii=False),
            "",
        ]

        def write_tabs(group_id: str | None) -> None:
            """Append active tabs for a group in the interchange format.

            Args:
                group_id (str | None): Collection ID or null for Unassigned.
            """
            for tab in document.library.tabs:
                if tab.placement.group_id == group_id and not tab.lifecycle.archived:
                    lines.append(f"- [{tab.content.title}]({tab.content.url})")
                    lines.append(f"  id: {tab.id}")
                    lines.append(f"  tags: {', '.join(tab.annotations.tags)}")
                    if fields != "minimal":
                        lines.append(
                            "  customProperties: "
                            + json.dumps(
                                tab.annotations.custom_properties,
                                ensure_ascii=False,
                                sort_keys=True,
                            )
                        )
                    lines.append("")

        for group in document.library.groups:
            lines.append(f"## {group.details.name}")
            if fields != "minimal":
                lines.append(f"  description: {group.details.description or ''}")
            lines.append("")
            write_tabs(group.id)
        lines.extend(["## [Unassigned]", ""])
        write_tabs(None)
        return TransferExportDTO(
            content="\n".join(lines).strip() + "\n",
            media_type="text/markdown",
        )

    def parse(
        self, content: Any, format: TransferFormat
    ) -> tuple[dict[str, Any] | None, list[IssueDTO]]:
        """Parse the current JSON or Markdown interchange format.

        Args:
            content (Any): Uploaded or generated document content.
            format (TransferFormat): Requested import or export format.

        Returns:
            tuple[dict[str, Any] | None, list[IssueDTO]]: Parsed document, if valid, and any
                validation issues.
        """
        if format == "markdown":
            return markdown_import(str(content))
        if isinstance(content, dict):
            return content, []
        try:
            value = json.loads(str(content))
            return value if isinstance(value, dict) else None, []
        except json.JSONDecodeError as error:
            return None, [
                issue(
                    "E_JSON_PARSE_ERROR",
                    f"line:{error.lineno}",
                    "valid JSON",
                    error.msg,
                    "JSON could not be parsed.",
                    422,
                )
            ]

    def _validated_document(
        self, content: Any, format: TransferFormat
    ) -> tuple[TransferDocumentDTO | None, list[IssueDTO], list[WarningDTO]]:
        """Share the import boundary between preview and apply operations.

        Args:
            content (Any): Uploaded or generated document content.
            format (TransferFormat): Requested import or export format.

        Returns:
            tuple[TransferDocumentDTO | None, list[IssueDTO], list[WarningDTO]]: Validated document,
                blocking issues, and nonblocking warnings.
        """
        document, parse_errors = self.parse(content, format)
        if parse_errors:
            return None, parse_errors, []
        errors, warnings = validate_document(document)
        if errors:
            return None, errors, warnings
        return TransferDocumentDTO.model_validate(document), [], warnings

    async def validate(self, content: Any, format: TransferFormat) -> ImportValidationDTO:
        """Validate an import and estimate its database effects without writes.

        Args:
            content (Any): Uploaded or generated document content.
            format (TransferFormat): Requested import or export format.

        Returns:
            ImportValidationDTO: Validation issues, warnings, and import summary.
        """
        dto, errors, warnings = self._validated_document(content, format)
        if dto is None:
            return ImportValidationDTO(
                valid=False,
                errors=errors,
                warnings=warnings,
                would_create=ImportCountsDTO(),
                would_update=ImportCountsDTO(),
                would_skip=ImportCountsDTO(),
            )
        current_tabs, current_groups, current_tags = await self.repository.current_ids()
        return ImportValidationDTO(
            valid=True,
            errors=[],
            warnings=warnings,
            would_create=ImportCountsDTO(
                tabs=sum(tab.id not in current_tabs for tab in dto.library.tabs),
                groups=sum(group.id not in current_groups for group in dto.library.groups),
                tags=sum(tag.name.lower() not in current_tags for tag in dto.library.tags),
            ),
            would_update=ImportCountsDTO(
                tabs=sum(tab.id in current_tabs for tab in dto.library.tabs),
                groups=sum(group.id in current_groups for group in dto.library.groups),
            ),
            would_skip=ImportCountsDTO(),
        )

    async def apply(
        self,
        content: Any,
        format: TransferFormat,
        mode: ImportMode,
        scope: str = "all",
    ) -> ImportApplyResultDTO:
        """Apply a validated import, backing up the current library before replacement.

        Args:
            content (Any): Uploaded or generated document content.
            format (TransferFormat): Requested import or export format.
            mode (ImportMode): Selected search or import mode.
            scope (str): Subset of library records to import or export.

        Returns:
            ImportApplyResultDTO: Created, updated, and skipped record counts with warnings.
        """
        dto, errors, warnings = self._validated_document(content, format)
        if dto is None:
            return ImportApplyResultDTO(success=False, errors=errors, warnings=warnings)
        backup_id: str | None = None
        if mode == "replace":
            backup = await self.create_backup("pre_replace_import")
            backup_id = backup.id
            if scope == "all":
                await self.repository.clear_library()
            elif scope.startswith("group:"):
                group_id = scope.split(":", 1)[1]
                await self.repository.replace_group(group_id)
        await self.repository.replace_property_schema(
            dict(dto.property_schema), replace=mode == "replace"
        )
        created = ImportCountsDTO()
        updated = ImportCountsDTO()
        for tag_dto in dto.library.tags:
            tag = await self.repository.get_tag(tag_dto.name)
            incoming_updated = stored_utc(tag_dto.updated_at)
            existing_updated = stored_utc(tag.updated_at) if tag is not None else None
            if tag is None:
                await self.repository.save_model(self.mapper.tag_from_dto(tag_dto))
                created.tags += 1
            elif incoming_updated and existing_updated and incoming_updated > existing_updated:
                await self.repository.apply_changes(tag, self.mapper.tag_changes(tag_dto))
                updated.tags += 1
        for group_dto in dto.library.groups:
            if await self.repository.tombstone_exists("group", group_dto.id):
                continue
            group = await self.repository.get_group(group_dto.id)
            incoming_updated = stored_utc(group_dto.timestamps.updated_at)
            existing_updated = (
                stored_utc(group.timestamps.updated_at) if group is not None else None
            )
            if group is None:
                await self.repository.save_model(self.mapper.group_from_dto(group_dto))
                created.groups += 1
            elif incoming_updated and existing_updated and incoming_updated > existing_updated:
                await self.repository.apply_changes(group, self.mapper.group_changes(group_dto))
                updated.groups += 1
        skipped = 0
        for tab_dto in dto.library.tabs:
            if await self.repository.tombstone_exists("tab", tab_dto.id):
                skipped += 1
                continue
            tab = await self.repository.get_transfer_tab(tab_dto.id)
            incoming_updated = stored_utc(tab_dto.timestamps.updated_at)
            existing_updated = stored_utc(tab.timestamps.updated_at) if tab is not None else None
            if tab is None:
                tags = await self.repository.resolve_tags(tab_dto.annotations.tags)
                await self.repository.save_model(self.mapper.tab_from_dto(tab_dto, tags))
                created.tabs += 1
            elif incoming_updated and existing_updated and incoming_updated > existing_updated:
                await self.repository.apply_changes(
                    tab,
                    self.mapper.tab_changes(
                        tab_dto, await self.repository.resolve_tags(tab_dto.annotations.tags)
                    ),
                )
                updated.tabs += 1
        await self.db.commit()
        if backup_id is not None:
            await self.prune_backups()
        return ImportApplyResultDTO(
            success=True,
            data=ImportApplyDataDTO(
                mode=mode,
                created=created,
                updated=updated,
                skipped_duplicates=skipped,
                backup_snapshot_id=backup_id,
            ),
            warnings=warnings,
        )

    async def backup_path(self, backup_id: str) -> Path:
        """Locate a registered backup without accepting a caller-controlled path.

        Args:
            backup_id (str): Stored backup identity.

        Returns:
            Path: Existing JSON snapshot file.

        Raises:
            BackupNotFoundError: Metadata or file is missing.
        """
        backup = await self.repository.get_backup(backup_id)
        if backup is None or not Path(backup.path).is_file():
            raise BackupNotFoundError(f"Backup {backup_id!r} was not found")
        return Path(backup.path)

    async def restore_backup(self, backup_id: str) -> ImportApplyResultDTO:
        """Validate and restore a backup directly, preserving a pre-replacement backup.

        Args:
            backup_id (str): Existing backup identifier.

        Returns:
            ImportApplyResultDTO: Completed transactional replacement result.

        Raises:
            BackupNotFoundError: The backup metadata or file is missing.
        """
        path = await self.backup_path(backup_id)
        try:
            return await self.apply(json.loads(path.read_text()), "json", "replace")
        except Exception:
            await self.db.rollback()
            raise

    async def backups(self) -> list[BackupDTO]:
        """List available backup snapshots.

        Returns:
            list[BackupDTO]: Matching records in display order.
        """
        return [self.mapper.backup_to_dto(row) for row in await self.repository.backups()]

    async def clear_library(self) -> LibraryClearDTO:
        """Back up and clear the complete local library atomically.

        Returns:
            LibraryClearDTO: Counts of library records removed.
        """
        backup = await self.create_backup("clear_library")
        await self.repository.clear_library()
        await self.db.commit()
        await self.prune_backups()
        return LibraryClearDTO(cleared=True, backup_snapshot_id=backup.id)
