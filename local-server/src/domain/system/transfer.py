from __future__ import annotations

import copy
import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config.settings import Settings
from domain.tabs.dto import TabBatchCreateDTO
from domain.tabs.repository import TabRepository
from domain.tabs.service import TabService
from lib.responses import issue
from lib.time import iso, utc_now
from lib.url import normalize_url
from models import Backup, Group, Job, Tab, Tag, Tombstone


def empty_document() -> dict[str, Any]:
    return {"schemaVersion": 1, "exportedAt": iso(utc_now()), "tags": [], "groups": [], "tabs": []}


def validate_document(document: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
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
                        {
                            "code": "W_ORPHAN_TAG",
                            "path": f"tabs[{index}].tags[{tag_index}]",
                            "message": f"Tag {tag!r} will be created.",
                        }
                    )
    return errors, warnings


def markdown_import(content: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    document = empty_document()
    groups_by_level: dict[int, str | None] = {}
    active_group: str | None = None
    active_tab: dict[str, Any] | None = None
    errors: list[dict[str, Any]] = []
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
                continue
            active_group = f"g-{uuid.uuid4()}"
            document["groups"].append(
                {
                    "id": active_group,
                    "name": name,
                    "parentId": groups_by_level.get(level - 1),
                    "position": len(document["groups"]),
                }
            )
            groups_by_level[level] = active_group
        elif link:
            active_tab = {
                "id": str(uuid.uuid4()),
                "url": link.group(2),
                "title": link.group(1),
                "note": None,
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
                active_tab["note"] = value or None
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
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    async def document(self) -> dict[str, Any]:
        tags = list((await self.db.scalars(select(Tag).order_by(func.lower(Tag.name)))).all())
        groups = list(
            (await self.db.scalars(select(Group).order_by(Group.position, Group.id))).all()
        )
        tabs = list(
            (
                await self.db.scalars(
                    select(Tab).options(selectinload(Tab.tags)).order_by(Tab.position, Tab.id)
                )
            ).unique()
        )
        return {
            "schemaVersion": 1,
            "exportedAt": iso(utc_now()),
            "tags": [
                {
                    "name": tag.name,
                    "description": tag.description,
                    "createdAt": iso(tag.created_at),
                    "updatedAt": iso(tag.updated_at),
                }
                for tag in tags
            ],
            "groups": [
                {
                    "id": group.id,
                    "name": group.name,
                    "parentId": group.parent_id,
                    "color": group.color,
                    "position": group.position,
                    "archived": group.archived,
                    "archivedAt": iso(group.archived_at),
                    "createdAt": iso(group.created_at),
                    "updatedAt": iso(group.updated_at),
                }
                for group in groups
            ],
            "tabs": [
                {
                    "id": tab.id,
                    "url": tab.url,
                    "title": tab.title,
                    "favicon": f"/api/v1/assets/{tab.favicon_asset_id}"
                    if tab.favicon_asset_id
                    else None,
                    "note": tab.note,
                    "tags": [tag.name for tag in tab.tags],
                    "groupId": tab.group_id,
                    "position": tab.position,
                    "archived": tab.archived,
                    "archivedAt": iso(tab.archived_at),
                    "createdAt": iso(tab.created_at),
                    "updatedAt": iso(tab.updated_at),
                }
                for tab in tabs
            ],
        }

    async def create_backup(self, reason: str) -> Backup:
        directory = self.settings.data_dir / "backups"
        directory.mkdir(parents=True, exist_ok=True)
        backup_id = str(uuid.uuid4())
        path = directory / f"{backup_id}.json"
        raw = json.dumps(await self.document(), ensure_ascii=False, indent=2).encode()
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(raw)
        temporary.replace(path)
        backup = Backup(id=backup_id, path=str(path), reason=reason, size_bytes=len(raw))
        self.db.add(backup)
        await self.db.flush()
        return backup

    async def export(
        self, format: Literal["json", "markdown"], scope: str, include_subgroups: bool, fields: str
    ) -> tuple[str | dict[str, Any], str]:
        document = await self.document()
        if scope.startswith("group:"):
            group_id = scope.split(":", 1)[1]
            ids = {group_id}
            if include_subgroups:
                changed = True
                while changed:
                    before = len(ids)
                    ids.update(
                        group["id"] for group in document["groups"] if group["parentId"] in ids
                    )
                    changed = before != len(ids)
            document["groups"] = [group for group in document["groups"] if group["id"] in ids]
            document["tabs"] = [tab for tab in document["tabs"] if tab["groupId"] in ids]
        elif scope.startswith("tag:"):
            name = scope.split(":", 1)[1]
            document["tabs"] = [tab for tab in document["tabs"] if name in tab["tags"]]
        if fields == "minimal":
            document["tabs"] = [
                {key: tab.get(key) for key in ("id", "url", "title", "favicon", "groupId", "tags")}
                for tab in document["tabs"]
            ]
        if format == "json":
            return document, "application/json"
        children: dict[str | None, list[dict[str, Any]]] = {}
        for group in document["groups"]:
            if not group.get("archived"):
                children.setdefault(group.get("parentId"), []).append(group)
        lines: list[str] = []

        def write_tabs(group_id: str | None) -> None:
            for tab in document["tabs"]:
                if tab.get("groupId") == group_id and not tab.get("archived"):
                    lines.append(f"- [{tab['title']}]({tab['url']})")
                    lines.append(f"  id: {tab['id']}")
                    lines.append(f"  tags: {', '.join(tab.get('tags', []))}")
                    if fields != "minimal":
                        lines.append(f"  note: {tab.get('note') or ''}")
                    lines.append("")

        def write_group(group: dict[str, Any], level: int) -> None:
            lines.extend([f"{'#' * level} {group['name']}", ""])
            write_tabs(group["id"])
            for child in children.get(group["id"], []):
                write_group(child, level + 1)

        for root in children.get(None, []):
            write_group(root, 2)
        lines.extend(["## Inbox", ""])
        write_tabs(None)
        return "\n".join(lines).strip() + "\n", "text/markdown"

    def parse(
        self, content: Any, format: Literal["json", "markdown"]
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
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

    async def validate(self, content: Any, format: Literal["json", "markdown"]) -> dict[str, Any]:
        document, parse_errors = self.parse(content, format)
        if parse_errors or document is None:
            return {
                "valid": False,
                "errors": parse_errors,
                "warnings": [],
                "wouldCreate": {},
                "wouldUpdate": {},
                "wouldSkip": {},
            }
        errors, warnings = validate_document(document)
        if errors:
            return {
                "valid": False,
                "errors": errors,
                "warnings": warnings,
                "wouldCreate": {},
                "wouldUpdate": {},
                "wouldSkip": {},
            }
        current_tabs = set((await self.db.scalars(select(Tab.id))).all())
        current_groups = set((await self.db.scalars(select(Group.id))).all())
        current_tags = {name.lower() for name in (await self.db.scalars(select(Tag.name))).all()}
        return {
            "valid": not errors,
            "errors": errors,
            "warnings": warnings,
            "wouldCreate": {
                "tabs": sum(tab.get("id") not in current_tabs for tab in document["tabs"]),
                "groups": sum(
                    group.get("id") not in current_groups for group in document["groups"]
                ),
                "tags": sum(
                    str(tag.get("name", "")).lower() not in current_tags for tag in document["tags"]
                ),
            },
            "wouldUpdate": {
                "tabs": sum(tab.get("id") in current_tabs for tab in document["tabs"]),
                "groups": sum(group.get("id") in current_groups for group in document["groups"]),
            },
            "wouldSkip": {},
        }

    async def apply(
        self,
        content: Any,
        format: Literal["json", "markdown"],
        mode: Literal["upload", "replace"],
        scope: str = "all",
    ) -> dict[str, Any]:
        document, parse_errors = self.parse(content, format)
        if parse_errors or document is None:
            return {"success": False, "errors": parse_errors, "warnings": []}
        errors, warnings = validate_document(document)
        if errors:
            return {"success": False, "errors": errors, "warnings": warnings}
        backup_id: str | None = None
        if mode == "replace":
            backup = await self.create_backup("pre_replace_import")
            backup_id = backup.id
            if scope == "all":
                await self.db.execute(delete(Tab))
                await self.db.execute(delete(Group))
                await self.db.execute(delete(Tag))
            elif scope.startswith("group:"):
                group_id = scope.split(":", 1)[1]
                await self.db.execute(delete(Tab).where(Tab.group_id == group_id))
                await self.db.execute(delete(Group).where(Group.id == group_id))
            await self.db.flush()
        created = {"tabs": 0, "groups": 0, "tags": 0}
        updated = {"tabs": 0, "groups": 0, "tags": 0}
        for item in document["tags"]:
            name = str(item["name"])
            tag = await self.db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
            incoming_updated = _datetime(item.get("updatedAt"))
            if tag is None:
                self.db.add(
                    Tag(
                        name=name,
                        description=item.get("description"),
                        created_at=_datetime(item.get("createdAt")) or utc_now(),
                        updated_at=incoming_updated or utc_now(),
                    )
                )
                created["tags"] += 1
            elif incoming_updated and incoming_updated > _aware(tag.updated_at):
                tag.description = item.get("description")
                tag.updated_at = incoming_updated
                updated["tags"] += 1
        await self.db.flush()
        pending_groups = {item["id"]: item for item in document["groups"]}
        ordered_groups: list[dict[str, Any]] = []
        while pending_groups:
            ready = [
                item
                for item in pending_groups.values()
                if not item.get("parentId") or item.get("parentId") not in pending_groups
            ]
            if not ready:
                ready = list(pending_groups.values())
            for item in ready:
                ordered_groups.append(item)
                pending_groups.pop(item["id"])
        for item in ordered_groups:
            tombstone = await self.db.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == "group", Tombstone.entity_id == item["id"]
                )
            )
            if tombstone:
                continue
            group = await self.db.get(Group, item["id"])
            incoming_updated = _datetime(item.get("updatedAt"))
            if group is None:
                self.db.add(
                    Group(
                        id=item["id"],
                        name=item["name"],
                        parent_id=item.get("parentId"),
                        color=item.get("color"),
                        position=float(item.get("position", 0)),
                        archived=bool(item.get("archived", False)),
                        archived_at=_datetime(item.get("archivedAt")),
                        created_at=_datetime(item.get("createdAt")) or utc_now(),
                        updated_at=incoming_updated or utc_now(),
                    )
                )
                await self.db.flush()
                created["groups"] += 1
            elif incoming_updated and incoming_updated > _aware(group.updated_at):
                group.name = item["name"]
                group.parent_id = item.get("parentId")
                group.color = item.get("color")
                group.position = float(item.get("position", group.position))
                group.archived = bool(item.get("archived", False))
                group.archived_at = _datetime(item.get("archivedAt"))
                group.updated_at = incoming_updated
                updated["groups"] += 1
        await self.db.flush()
        tab_service = TabService(self.db, TabRepository(self.db))
        skipped = 0
        for item in document["tabs"]:
            tombstone = await self.db.scalar(
                select(Tombstone.id).where(
                    Tombstone.entity_type == "tab", Tombstone.entity_id == item["id"]
                )
            )
            if tombstone:
                skipped += 1
                continue
            tab = await tab_service.repository.get(item["id"])
            incoming_updated = _datetime(item.get("updatedAt"))
            if tab is None:
                result, _ = await tab_service.create_batch(
                    TabBatchCreateDTO(tabs=[item], dedupe=True, dedupe_strategy="merge"),
                    atomic=True,
                    commit=False,
                )
                created["tabs"] += int(
                    bool(result["created"] and not result["created"][0].get("wasDuplicate"))
                )
                skipped += int(bool(result["skipped"]))
            elif incoming_updated and incoming_updated > _aware(tab.updated_at):
                tab.title = item["title"]
                tab.note = item.get("note")
                tab.group_id = (
                    None if item.get("groupId") in {None, "", "inbox"} else item.get("groupId")
                )
                tab.position = float(item.get("position", tab.position))
                tab.archived = bool(item.get("archived", False))
                tab.archived_at = _datetime(item.get("archivedAt"))
                tab.tags = await tab_service._tags(item.get("tags", []))
                tab.updated_at = incoming_updated
                updated["tabs"] += 1
        await self.db.commit()
        return {
            "success": True,
            "data": {
                "mode": mode,
                "created": created,
                "updated": updated,
                "skippedDuplicates": skipped,
                "backupSnapshotId": backup_id,
            },
            "warnings": warnings,
        }

    async def restore_backup(self, backup_id: str) -> str | None:
        backup = await self.db.get(Backup, backup_id)
        if backup is None or not Path(backup.path).exists():
            return None
        job = Job(
            kind="backup_restore",
            target_id=backup_id,
            result={"content": json.loads(Path(backup.path).read_text(encoding="utf-8"))},
        )
        self.db.add(job)
        await self.db.commit()
        return job.id


def _datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return _aware(value)
    try:
        return _aware(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except ValueError:
        return None


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=utc_now().tzinfo) if value.tzinfo is None else value
