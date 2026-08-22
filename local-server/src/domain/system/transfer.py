"""Portable library import, export, validation, and backup use cases."""

from __future__ import annotations

import copy
import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from lib.responses import IssueDTO, WarningDTO, issue
from lib.time import iso, utc_now
from lib.url import normalize_url

from .dto import (
    BackupDTO,
    ExportFields,
    ImportApplyDataDTO,
    ImportApplyResultDTO,
    ImportCountsDTO,
    ImportMode,
    ImportValidationDTO,
    MinimalTransferDocumentDTO,
    MinimalTransferTabDTO,
    TransferDocumentDTO,
    TransferExportDTO,
    TransferFormat,
    TransferGroupDTO,
)
from .mapper import SystemMapper
from .repository import SystemRepository


def empty_document() -> dict[str, Any]:
    """Create an empty raw portable document for the Markdown parser."""
    return {"schemaVersion": 1, "exportedAt": iso(utc_now()), "tags": [], "groups": [], "tabs": []}


def validate_document(document: Any) -> tuple[list[IssueDTO], list[WarningDTO]]:
    """Validate untrusted portable-document structure and references."""
    errors: list[IssueDTO] = []
    warnings: list[WarningDTO] = []
    if not isinstance(document, dict):
        return [
            issue(
                "E_INVALID_DOCUMENT",
                "$",
                "JSON object",
                type(document).__name__,
                "Import must contain a JSON object.",
                422,
            )
        ], warnings
    if document.get("schemaVersion") != 1:
        errors.append(
            issue(
                "E_UNKNOWN_SCHEMA_VERSION",
                "$.schemaVersion",
                "1",
                document.get("schemaVersion"),
                "Unsupported schema version.",
                422,
            )
        )
    for key in ("tags", "groups", "tabs"):
        if not isinstance(document.get(key), list):
            errors.append(
                issue(
                    "E_MISSING_REQUIRED_FIELD",
                    f"$.{key}",
                    "array",
                    document.get(key),
                    f"{key} must be an array.",
                    422,
                )
            )
    if errors:
        return errors, warnings
    group_ids: set[str] = set()
    parents: dict[str, str | None] = {}
    for index, group in enumerate(document["groups"]):
        if not isinstance(group, dict):
            errors.append(
                issue(
                    "E_INVALID_OBJECT",
                    f"groups[{index}]",
                    "object",
                    group,
                    "Group must be an object.",
                    422,
                )
            )
            continue
        for field in ("id", "name"):
            if not isinstance(group.get(field), str) or not group[field].strip():
                errors.append(
                    issue(
                        "E_MISSING_REQUIRED_FIELD",
                        f"groups[{index}].{field}",
                        "non-empty string",
                        group.get(field),
                        f"Group {field} is required.",
                        422,
                    )
                )
        group_id = group.get("id")
        if isinstance(group_id, str):
            if group_id in group_ids:
                errors.append(
                    issue(
                        "E_DUPLICATE_ID",
                        f"groups[{index}].id",
                        "unique id",
                        group_id,
                        "Group ID is duplicated.",
                        422,
                    )
                )
            group_ids.add(group_id)
            parents[group_id] = (
                group.get("parentId") if isinstance(group.get("parentId"), str) else None
            )
    for group_id, parent_id in parents.items():
        if parent_id and parent_id not in group_ids:
            errors.append(
                issue(
                    "E_UNKNOWN_GROUP_REFERENCE",
                    f"groups[{group_id}].parentId",
                    "existing group id",
                    parent_id,
                    "Parent group does not exist.",
                    422,
                )
            )
        seen: set[str] = set()
        current: str | None = group_id
        while current:
            if current in seen:
                errors.append(
                    issue(
                        "E_CYCLIC_GROUP_REFERENCE",
                        f"groups[{group_id}].parentId",
                        "acyclic tree",
                        parent_id,
                        "Group parents form a cycle.",
                        422,
                    )
                )
                break
            seen.add(current)
            current = parents.get(current)
    tab_ids: set[str] = set()
    urls: set[str] = set()
    tag_names = {
        str(item.get("name"))
        for item in document["tags"]
        if isinstance(item, dict) and item.get("name")
    }
    for index, tab in enumerate(document["tabs"]):
        if not isinstance(tab, dict):
            errors.append(
                issue(
                    "E_INVALID_OBJECT",
                    f"tabs[{index}]",
                    "object",
                    tab,
                    "Tab must be an object.",
                    422,
                )
            )
            continue
        for field in ("id", "url", "title"):
            if not isinstance(tab.get(field), str) or not tab[field].strip():
                errors.append(
                    issue(
                        "E_MISSING_REQUIRED_FIELD",
                        f"tabs[{index}].{field}",
                        "non-empty string",
                        tab.get(field),
                        f"Tab {field} is required.",
                        422,
                    )
                )
        if isinstance(tab.get("id"), str):
            if tab["id"] in tab_ids:
                errors.append(
                    issue(
                        "E_DUPLICATE_ID",
                        f"tabs[{index}].id",
                        "unique id",
                        tab["id"],
                        "Tab ID is duplicated.",
                        422,
                    )
                )
            tab_ids.add(tab["id"])
        try:
            normalized = normalize_url(str(tab.get("url", "")))
            if normalized in urls:
                errors.append(
                    issue(
                        "E_DUPLICATE_URL",
                        f"tabs[{index}].url",
                        "unique normalized URL",
                        tab.get("url"),
                        "URL is duplicated after normalization.",
                        422,
                    )
                )
            urls.add(normalized)
        except ValueError:
            errors.append(
                issue(
                    "E_INVALID_URL",
                    f"tabs[{index}].url",
                    "absolute http/https URL",
                    tab.get("url"),
                    "URL must start with http:// or https://.",
                    422,
                )
            )
        group_id = tab.get("groupId")
        if group_id not in {None, "", "inbox"} and group_id not in group_ids:
            errors.append(
                issue(
                    "E_UNKNOWN_GROUP_REFERENCE",
                    f"tabs[{index}].groupId",
                    "existing group id or null",
                    group_id,
                    "Tab group does not exist.",
                    422,
                )
            )
        tags = tab.get("tags", [])
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            errors.append(
                issue(
                    "E_INVALID_TAGS",
                    f"tabs[{index}].tags",
                    "array of strings",
                    tags,
                    "Tab tags must be strings.",
                    422,
                )
            )
        else:
            for tag_index, tag in enumerate(tags):
                if tag not in tag_names:
                    warnings.append(
                        WarningDTO(
                            code="W_ORPHAN_TAG",
                            path=f"tabs[{index}].tags[{tag_index}]",
                            message=f"Tag {tag!r} will be created.",
                        )
                    )
    return errors, warnings


def markdown_import(content: str) -> tuple[dict[str, Any] | None, list[IssueDTO]]:
    """Parse the documented Markdown interchange format."""
    document = empty_document()
    groups_by_level: dict[int, str | None] = {}
    active_group: str | None = None
    active_group_record: dict[str, Any] | None = None
    active_tab: dict[str, Any] | None = None
    errors: list[IssueDTO] = []
    for number, line in enumerate(content.splitlines(), 1):
        if not line.strip():
            continue
        header = re.match(r"^(#{2,})\s+(.+?)\s*$", line)
        link = re.match(r"^-\s+\[(.+?)\]\((.+?)\)\s*$", line)
        metadata = re.match(r"^\s{2,}([a-zA-Z]+):\s*(.*?)\s*$", line)
        if header:
            level, name = len(header.group(1)), header.group(2).strip()
            active_tab = None
            if name.lower() == "inbox":
                active_group = None
                active_group_record = None
                continue
            active_group = f"g-{uuid.uuid4()}"
            active_group_record = {
                "id": active_group,
                "name": name,
                "description": "",
                "parentId": groups_by_level.get(level - 1),
                "position": len(document["groups"]),
            }
            document["groups"].append(active_group_record)
            groups_by_level[level] = active_group
        elif link:
            active_tab = {
                "id": str(uuid.uuid4()),
                "url": link.group(2),
                "title": link.group(1),
                "note": "",
                "agentReview": "",
                "viewed": False,
                "tags": [],
                "groupId": active_group,
                "position": len(document["tabs"]),
            }
            document["tabs"].append(active_tab)
        elif metadata and active_tab is not None:
            key, value = metadata.groups()
            if key == "id" and value:
                active_tab["id"] = value
            elif key == "tags":
                active_tab["tags"] = [item.strip() for item in value.split(",") if item.strip()]
            elif key == "note":
                active_tab["note"] = value
            elif key == "agentReview":
                active_tab["agentReview"] = value
            elif key == "viewed":
                active_tab["viewed"] = value.lower() == "true"
        elif metadata and active_group_record is not None:
            key, value = metadata.groups()
            if key == "description":
                active_group_record["description"] = value
        else:
            errors.append(
                issue(
                    "E_MARKDOWN_PARSE_ERROR",
                    f"line:{number}",
                    "heading, link, or metadata",
                    line,
                    "Line is not valid TabVault Markdown.",
                    422,
                )
            )
    return (None, errors) if errors else (document, [])


class TransferService:
    """Orchestrate transfer and backup use cases while owning transactions."""

    def __init__(self, db: AsyncSession, settings: Settings, repository: SystemRepository) -> None:
        """Initialize the service and its persistence dependency."""
        self.db = db
        self.settings = settings
        self.repository = repository
        self.mapper = SystemMapper()

    async def document(self) -> TransferDocumentDTO:
        """Build the complete portable library document."""
        tags, groups, tabs = await self.repository.transfer_rows()
        return TransferDocumentDTO(
            exported_at=utc_now(),
            tags=[self.mapper.tag_to_transfer(tag) for tag in tags],
            groups=[self.mapper.group_to_transfer(group) for group in groups],
            tabs=[self.mapper.tab_to_transfer(tab) for tab in tabs],
        )

    async def create_backup(self, reason: str) -> BackupDTO:
        """Atomically write and register a library backup."""
        directory = self.settings.data_dir / "backups"
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
        include_subgroups: bool,
        fields: ExportFields,
    ) -> TransferExportDTO:
        """Export a filtered library as JSON or Markdown."""
        document = await self.document()
        if scope.startswith("group:"):
            group_id = scope.split(":", 1)[1]
            ids = {group_id}
            if include_subgroups:
                changed = True
                while changed:
                    before = len(ids)
                    ids.update(group.id for group in document.groups if group.parent_id in ids)
                    changed = before != len(ids)
            document.groups = [group for group in document.groups if group.id in ids]
            document.tabs = [tab for tab in document.tabs if tab.group_id in ids]
        elif scope.startswith("tag:"):
            name = scope.split(":", 1)[1]
            document.tabs = [tab for tab in document.tabs if name in tab.tags]
        content: TransferDocumentDTO | MinimalTransferDocumentDTO = document
        if fields == "minimal":
            content = MinimalTransferDocumentDTO(
                exported_at=document.exported_at,
                tags=document.tags,
                groups=document.groups,
                tabs=[
                    MinimalTransferTabDTO(
                        id=tab.id,
                        url=tab.url,
                        title=tab.title,
                        favicon=tab.favicon,
                        group_id=tab.group_id,
                        tags=tab.tags,
                    )
                    for tab in document.tabs
                ],
            )
        if format == "json":
            return TransferExportDTO(content=content, media_type="application/json")
        children: dict[str | None, list[TransferGroupDTO]] = {}
        for group in document.groups:
            if not group.archived:
                children.setdefault(group.parent_id, []).append(group)
        lines: list[str] = []

        def write_tabs(group_id: str | None) -> None:
            """Append Markdown for active tabs in one group."""
            for tab in document.tabs:
                if tab.group_id == group_id and not tab.archived:
                    lines.append(f"- [{tab.title}]({tab.url})")
                    lines.append(f"  id: {tab.id}")
                    lines.append(f"  tags: {', '.join(tab.tags)}")
                    if fields != "minimal":
                        lines.append(f"  note: {tab.note or ''}")
                        lines.append(f"  agentReview: {tab.agent_review or ''}")
                        lines.append(f"  viewed: {str(tab.viewed).lower()}")
                    lines.append("")

        def write_group(group: TransferGroupDTO, level: int) -> None:
            """Append Markdown for a group and its descendants."""
            lines.append(f"{'#' * level} {group.name}")
            if fields != "minimal":
                lines.append(f"  description: {group.description or ''}")
            lines.append("")
            write_tabs(group.id)
            for child in children.get(group.id, []):
                write_group(child, level + 1)

        for root in children.get(None, []):
            write_group(root, 2)
        lines.extend(["## Inbox", ""])
        write_tabs(None)
        return TransferExportDTO(
            content="\n".join(lines).strip() + "\n",
            media_type="text/markdown",
        )

    def parse(
        self, content: Any, format: TransferFormat
    ) -> tuple[dict[str, Any] | None, list[IssueDTO]]:
        """Parse untrusted JSON or Markdown into a raw document."""
        if format == "markdown":
            return markdown_import(str(content))
        if isinstance(content, dict):
            return copy.deepcopy(content), []
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

    async def validate(self, content: Any, format: TransferFormat) -> ImportValidationDTO:
        """Validate an import and estimate its database effects."""
        document, parse_errors = self.parse(content, format)
        if parse_errors or document is None:
            return ImportValidationDTO(
                valid=False,
                errors=parse_errors,
                warnings=[],
                would_create=ImportCountsDTO(),
                would_update=ImportCountsDTO(),
                would_skip=ImportCountsDTO(),
            )
        errors, warnings = validate_document(document)
        if errors:
            return ImportValidationDTO(
                valid=False,
                errors=errors,
                warnings=warnings,
                would_create=ImportCountsDTO(),
                would_update=ImportCountsDTO(),
                would_skip=ImportCountsDTO(),
            )
        dto = TransferDocumentDTO.model_validate(document)
        current_tabs, current_groups, current_tags = await self.repository.current_ids()
        return ImportValidationDTO(
            valid=True,
            errors=[],
            warnings=warnings,
            would_create=ImportCountsDTO(
                tabs=sum(tab.id not in current_tabs for tab in dto.tabs),
                groups=sum(group.id not in current_groups for group in dto.groups),
                tags=sum(tag.name.lower() not in current_tags for tag in dto.tags),
            ),
            would_update=ImportCountsDTO(
                tabs=sum(tab.id in current_tabs for tab in dto.tabs),
                groups=sum(group.id in current_groups for group in dto.groups),
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
        """Validate and apply an imported library document."""
        document, parse_errors = self.parse(content, format)
        if parse_errors or document is None:
            return ImportApplyResultDTO(success=False, errors=parse_errors, warnings=[])
        errors, warnings = validate_document(document)
        if errors:
            return ImportApplyResultDTO(success=False, errors=errors, warnings=warnings)
        dto = TransferDocumentDTO.model_validate(document)
        backup_id: str | None = None
        if mode == "replace":
            backup = await self.create_backup("pre_replace_import")
            backup_id = backup.id
            if scope == "all":
                await self.repository.clear_library()
            elif scope.startswith("group:"):
                group_id = scope.split(":", 1)[1]
                await self.repository.replace_group(group_id)
        created = ImportCountsDTO()
        updated = ImportCountsDTO()
        for tag_dto in dto.tags:
            tag = await self.repository.get_tag(tag_dto.name)
            incoming_updated = tag_dto.updated_at
            if tag is None:
                await self.repository.save_model(self.mapper.tag_from_transfer(tag_dto))
                created.tags += 1
            elif incoming_updated and incoming_updated > _aware(tag.updated_at):
                await self.repository.apply_changes(tag, self.mapper.tag_transfer_changes(tag_dto))
                updated.tags += 1
        pending_groups = {group_dto.id: group_dto for group_dto in dto.groups}
        ordered_groups: list[TransferGroupDTO] = []
        while pending_groups:
            ready = [
                group_dto
                for group_dto in pending_groups.values()
                if not group_dto.parent_id or group_dto.parent_id not in pending_groups
            ]
            if not ready:
                ready = list(pending_groups.values())
            for group_dto in ready:
                ordered_groups.append(group_dto)
                pending_groups.pop(group_dto.id)
        for group_dto in ordered_groups:
            if await self.repository.tombstone_exists("group", group_dto.id):
                continue
            group = await self.repository.get_group(group_dto.id)
            incoming_updated = group_dto.updated_at
            if group is None:
                await self.repository.save_model(self.mapper.group_from_transfer(group_dto))
                created.groups += 1
            elif incoming_updated and incoming_updated > _aware(group.updated_at):
                await self.repository.apply_changes(
                    group, self.mapper.group_transfer_changes(group_dto)
                )
                updated.groups += 1
        skipped = 0
        for tab_dto in dto.tabs:
            if await self.repository.tombstone_exists("tab", tab_dto.id):
                skipped += 1
                continue
            tab = await self.repository.get_transfer_tab(tab_dto.id)
            incoming_updated = tab_dto.updated_at
            if tab is None:
                normalized = normalize_url(tab_dto.url)
                duplicate = await self.repository.find_tab_url(normalized)
                if duplicate is not None:
                    tags = await self.repository.resolve_tags(
                        [*[tag.name for tag in duplicate.tags], *tab_dto.tags]
                    )
                    await self.repository.apply_changes(
                        duplicate,
                        self.mapper.tab_duplicate_changes(tab_dto, tags),
                    )
                    skipped += 1
                    continue
                tags = await self.repository.resolve_tags(tab_dto.tags)
                await self.repository.save_model(
                    self.mapper.tab_from_transfer(tab_dto, normalized, tags)
                )
                created.tabs += 1
            elif incoming_updated and incoming_updated > _aware(tab.updated_at):
                await self.repository.apply_changes(
                    tab,
                    self.mapper.tab_transfer_changes(
                        tab_dto, await self.repository.resolve_tags(tab_dto.tags)
                    ),
                )
                updated.tabs += 1
        await self.db.commit()
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

    async def restore_backup(self, backup_id: str) -> str | None:
        """Queue replacement import from a stored backup file."""
        backup = await self.repository.get_backup(backup_id)
        if backup is None or not Path(backup.path).exists():
            return None
        job = self.mapper.job(
            "backup_restore",
            target_id=backup_id,
            result={"content": json.loads(Path(backup.path).read_text(encoding="utf-8"))},
        )
        await self.repository.add_job(job)
        await self.db.commit()
        return job.id


def _aware(value: datetime) -> datetime:
    """Attach the local UTC timezone to naive persisted datetimes."""
    return value.replace(tzinfo=utc_now().tzinfo) if value.tzinfo is None else value
