"""Signal Library implementation: localhost-only FastAPI source of truth for TabVault."""

from __future__ import annotations

import copy
import json
import logging
import os
import re
import shutil
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from .healthcheck import IndexHealthScheduler
from .indexing import IndexRebuildScheduler
from .semantic import SemanticIndex, SemanticUnavailable

SCHEMA_VERSION = 1
TRACKING_PREFIXES = ("utm_",)
TRACKING_KEYS = {"gclid", "fbclid", "mc_cid", "mc_eid"}
API_KEY = os.environ.get("TABVAULT_API_KEY", "admin")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("TABVAULT_CORS_ORIGINS", "*").split(",")
    if origin.strip()
] or ["*"]
CORS_ALLOWS_ALL = "*" in ALLOWED_ORIGINS
logger = logging.getLogger("tabvault_server")
CORS_WILDCARD_WARNING = (
    "CORS is open to all origins (*). This is the development default. "
    "Set TABVAULT_CORS_ORIGINS to a comma-separated allowlist before exposing this server."
)


def warn_open_cors() -> None:
    if CORS_ALLOWS_ALL:
        logger.warning(CORS_WILDCARD_WARNING)
        print(f"WARNING: {CORS_WILDCARD_WARNING}", flush=True)


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def empty_document() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "exportedAt": now_iso(),
        "tags": [],
        "groups": [],
        "tabs": [],
    }


def issue(
    code: str, path: str, expected: str, received: Any, message: str, suggested_fix: str
) -> dict[str, Any]:
    return {
        "code": code,
        "path": path,
        "expected": expected,
        "received": received,
        "message": message,
        "suggestedFix": suggested_fix,
    }


def warning(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def normalise_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be an absolute http or https URL")
    kept_query = [
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith(TRACKING_PREFIXES) and key.lower() not in TRACKING_KEYS
    ]
    kept_query.sort(key=lambda item: (item[0], item[1]))
    path = parsed.path.rstrip("/") or "/"
    hostname = (parsed.hostname or "").lower()
    port = parsed.port
    include_port = port is not None and not (
        (parsed.scheme.lower() == "http" and port == 80)
        or (parsed.scheme.lower() == "https" and port == 443)
    )
    netloc = hostname if not include_port else f"{hostname}:{port}"
    return urlunparse((parsed.scheme.lower(), netloc, path, "", urlencode(kept_query), ""))


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "group"


class LocalStore:
    def __init__(self, directory: str | None = None) -> None:
        configured_directory = directory or os.environ.get("TABVAULT_DATA_DIR")
        self.directory = (
            Path(configured_directory)
            if configured_directory
            else Path.home() / ".local" / "share" / "tabvault"
        )
        self.path = self.directory / "tabvault.json"
        self.backup_directory = self.directory / "backups"

    def read(self) -> dict[str, Any]:
        if not self.path.exists():
            return empty_document()
        try:
            document = json.loads(self.path.read_text(encoding="utf-8"))
            return document if isinstance(document, dict) else empty_document()
        except (OSError, json.JSONDecodeError):
            return empty_document()

    def write(self, document: dict[str, Any]) -> dict[str, Any]:
        self.directory.mkdir(parents=True, exist_ok=True)
        document = copy.deepcopy(document)
        document["schemaVersion"] = SCHEMA_VERSION
        document["exportedAt"] = now_iso()
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        temporary.replace(self.path)
        return document

    def backup(self) -> Path | None:
        if not self.path.exists():
            return None
        self.backup_directory.mkdir(parents=True, exist_ok=True)
        path = self.backup_directory / f"tabvault-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        shutil.copy2(self.path, path)
        return path


store = LocalStore()
semantic_index = SemanticIndex(store.directory)
health_scheduler = IndexHealthScheduler(store.directory, semantic_index.status)
index_scheduler = IndexRebuildScheduler(store.read, semantic_index)


def persist_document(document: dict[str, Any]) -> dict[str, Any]:
    stored = store.write(document)
    semantic_index.mark_stale()
    index_scheduler.request_rebuild()
    return stored


def validate_document(document: Any) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(document, dict):
        return [
            issue(
                "E_INVALID_DOCUMENT",
                "$",
                "JSON object",
                type(document).__name__,
                "The import must contain a JSON object.",
                "Wrap the export in an object with schemaVersion, tags, groups, and tabs.",
            )
        ], warnings

    version = document.get("schemaVersion")
    if version != SCHEMA_VERSION:
        errors.append(
            issue(
                "E_UNKNOWN_SCHEMA_VERSION",
                "$.schemaVersion",
                f"one of [{SCHEMA_VERSION}]",
                version,
                f"Schema version {version!r} is not supported by this server.",
                f"Export data using schema version {SCHEMA_VERSION}, or update TabVault.",
            )
        )

    structural_errors = False
    for key in ("tags", "groups", "tabs"):
        if not isinstance(document.get(key), list):
            structural_errors = True
            errors.append(
                issue(
                    "E_MISSING_REQUIRED_FIELD",
                    f"$.{key}",
                    "array",
                    document.get(key),
                    f"{key} must be an array.",
                    f"Add a {key}: [] array to the export.",
                )
            )
    if structural_errors:
        return errors, warnings

    tag_names: set[str] = set()
    for index, tag in enumerate(document["tags"]):
        if (
            not isinstance(tag, dict)
            or not isinstance(tag.get("name"), str)
            or not tag["name"].strip()
        ):
            errors.append(
                issue(
                    "E_MISSING_REQUIRED_FIELD",
                    f"tags[{index}].name",
                    "non-empty string",
                    tag.get("name") if isinstance(tag, dict) else tag,
                    "Every tag needs a non-empty name.",
                    "Set name to a unique tag string.",
                )
            )
        elif tag["name"] in tag_names:
            errors.append(
                issue(
                    "E_DUPLICATE_ID",
                    f"tags[{index}].name",
                    "unique tag name",
                    tag["name"],
                    f"Tag {tag['name']!r} appears more than once.",
                    "Keep one tag definition for each name.",
                )
            )
        else:
            tag_names.add(tag["name"])

    group_ids: set[str] = set()
    parent_by_group: dict[str, str | None] = {}
    for index, group in enumerate(document["groups"]):
        path = f"groups[{index}]"
        if not isinstance(group, dict):
            errors.append(
                issue(
                    "E_INVALID_OBJECT",
                    path,
                    "object",
                    type(group).__name__,
                    "Every group must be an object.",
                    "Use an object with id, name, and optional parentId.",
                )
            )
            continue
        for field in ("id", "name"):
            if not isinstance(group.get(field), str) or not group[field].strip():
                errors.append(
                    issue(
                        "E_MISSING_REQUIRED_FIELD",
                        f"{path}.{field}",
                        "non-empty string",
                        group.get(field),
                        f"Group {field} is required.",
                        f"Set {field} to a non-empty string.",
                    )
                )
        group_id = group.get("id")
        if isinstance(group_id, str) and group_id:
            if group_id in group_ids:
                errors.append(
                    issue(
                        "E_DUPLICATE_ID",
                        f"{path}.id",
                        "unique group id",
                        group_id,
                        f"Group id {group_id!r} appears more than once.",
                        "Generate a new UUID for this group.",
                    )
                )
            group_ids.add(group_id)
            parent_by_group[group_id] = (
                group.get("parentId") if isinstance(group.get("parentId"), str) else None
            )

    for group_id, parent_id in parent_by_group.items():
        if parent_id and parent_id not in group_ids:
            errors.append(
                issue(
                    "E_UNKNOWN_GROUP_REFERENCE",
                    f"groups[{group_id}].parentId",
                    "existing group id or null",
                    parent_id,
                    f"Parent group {parent_id!r} does not exist.",
                    "Create the parent group first or set parentId to null.",
                )
            )
        visited: set[str] = set()
        current = group_id
        while current and current in parent_by_group:
            if current in visited:
                errors.append(
                    issue(
                        "E_CYCLIC_GROUP_REFERENCE",
                        f"groups[{group_id}].parentId",
                        "acyclic group tree",
                        parent_id,
                        "Group parents form a cycle.",
                        "Remove one parentId so every group has one acyclic path to a root.",
                    )
                )
                break
            visited.add(current)
            current = parent_by_group[current] or ""

    tab_ids: set[str] = set()
    normalised_urls: dict[str, int] = {}
    for index, tab in enumerate(document["tabs"]):
        path = f"tabs[{index}]"
        if not isinstance(tab, dict):
            errors.append(
                issue(
                    "E_INVALID_OBJECT",
                    path,
                    "object",
                    type(tab).__name__,
                    "Every tab must be an object.",
                    "Use an object with id, url, title, tags, and groupId.",
                )
            )
            continue
        for field in ("id", "url", "title"):
            if not isinstance(tab.get(field), str) or not tab[field].strip():
                errors.append(
                    issue(
                        "E_MISSING_REQUIRED_FIELD",
                        f"{path}.{field}",
                        "non-empty string",
                        tab.get(field),
                        f"Tab {field} is required.",
                        f"Set {field} to a non-empty string.",
                    )
                )
        tab_id = tab.get("id")
        if isinstance(tab_id, str) and tab_id:
            if tab_id in tab_ids:
                errors.append(
                    issue(
                        "E_DUPLICATE_ID",
                        f"{path}.id",
                        "unique id across document",
                        tab_id,
                        f"Tab id {tab_id!r} is already used.",
                        "Generate a new UUID or use one id for an upsert.",
                    )
                )
            tab_ids.add(tab_id)
        if isinstance(tab.get("url"), str) and tab["url"].strip():
            try:
                normalised = normalise_url(tab["url"])
                if normalised in normalised_urls:
                    errors.append(
                        issue(
                            "E_DUPLICATE_URL",
                            f"{path}.url",
                            "unique normalised URL",
                            tab["url"],
                            f"This URL duplicates tabs[{normalised_urls[normalised]}] after normalisation.",
                            "Remove the duplicate, or merge its note and tags into the existing tab.",
                        )
                    )
                else:
                    normalised_urls[normalised] = index
            except ValueError:
                errors.append(
                    issue(
                        "E_INVALID_URL",
                        f"{path}.url",
                        "valid absolute URL (http/https)",
                        tab["url"],
                        "URL must start with http:// or https://.",
                        f"https://{tab['url'].lstrip('/') if isinstance(tab['url'], str) else 'example.com'}",
                    )
                )
        group_id = tab.get("groupId")
        if group_id not in (None, "", "inbox") and group_id not in group_ids:
            errors.append(
                issue(
                    "E_UNKNOWN_GROUP_REFERENCE",
                    f"{path}.groupId",
                    "existing group id, null, or inbox",
                    group_id,
                    f"Group {group_id!r} does not exist.",
                    "Create the group first or move the tab to Inbox.",
                )
            )
        if not isinstance(tab.get("tags", []), list) or not all(
            isinstance(tag, str) for tag in tab.get("tags", [])
        ):
            errors.append(
                issue(
                    "E_INVALID_TAGS",
                    f"{path}.tags",
                    "array of strings",
                    tab.get("tags"),
                    "Tab tags must be an array of strings.",
                    'Use tags: ["work", "read-later"].',
                )
            )
        else:
            for tag_index, tag in enumerate(tab.get("tags", [])):
                if tag not in tag_names:
                    warnings.append(
                        warning(
                            "W_ORPHAN_TAG",
                            f"{path}.tags[{tag_index}]",
                            f"Tag {tag!r} is not in the tag directory and will be created automatically.",
                        )
                    )

    return errors, warnings


def create_tags_for_tabs(document: dict[str, Any]) -> None:
    known = {
        tag["name"]
        for tag in document["tags"]
        if isinstance(tag, dict) and isinstance(tag.get("name"), str)
    }
    for tab in document["tabs"]:
        for tag in tab.get("tags", []):
            if tag not in known:
                document["tags"].append({"name": tag, "description": None, "createdAt": now_iso()})
                known.add(tag)


def normalise_document(document: dict[str, Any]) -> dict[str, Any]:
    data = copy.deepcopy(document)
    data["schemaVersion"] = SCHEMA_VERSION
    data.setdefault("exportedAt", now_iso())
    for index, tab in enumerate(data["tabs"]):
        tab["url"] = normalise_url(tab["url"])
        tab.setdefault("id", str(uuid.uuid4()))
        tab.setdefault("tags", [])
        tab["groupId"] = None if tab.get("groupId") in ("", "inbox") else tab.get("groupId")
        tab["archived"] = bool(tab.get("archived", False))
        if not tab["archived"]:
            tab["archivedAt"] = None
        tab.setdefault("position", index)
        tab.setdefault("createdAt", now_iso())
        tab["updatedAt"] = now_iso()
    for index, group in enumerate(data["groups"]):
        group.setdefault("position", index)
        group.setdefault("color", None)
        group.setdefault("createdAt", now_iso())
        group["updatedAt"] = now_iso()
    create_tags_for_tabs(data)
    return data


def markdown_export(
    document: dict[str, Any], group_filter: str | None = None, tag_filter: str | None = None
) -> str:
    tabs = [
        tab for tab in document["tabs"] if (not tag_filter or tag_filter in tab.get("tags", []))
    ]
    allowed_groups: set[str] | None = None
    if group_filter:
        allowed_groups = {group_filter}
        changed = True
        while changed:
            changed = False
            for group in document["groups"]:
                if group.get("parentId") in allowed_groups and group["id"] not in allowed_groups:
                    allowed_groups.add(group["id"])
                    changed = True
        tabs = [tab for tab in tabs if tab.get("groupId") in allowed_groups]

    lines: list[str] = []
    children: dict[str | None, list[dict[str, Any]]] = {}
    for group in document["groups"]:
        children.setdefault(group.get("parentId"), []).append(group)
    for groups in children.values():
        groups.sort(key=lambda group: (group.get("position", 0), group["name"].lower()))

    def write_tabs(group_id: str | None) -> None:
        for tab in sorted(
            (item for item in tabs if item.get("groupId") == group_id),
            key=lambda item: item.get("position", 0),
        ):
            lines.append(f"- [{tab['title']}]({tab['url']})")
            lines.append(f"  id: {tab['id']}")
            lines.append(f"  tags: {', '.join(tab.get('tags', []))}")
            lines.append(f"  note: {tab.get('note') or ''}")
            lines.append(
                f"  createdAt: {datetime.fromisoformat(tab['createdAt'].replace('Z', '+00:00')).strftime('%d/%m/%Y')}"
            )
            lines.append(
                f"  updatedAt: {datetime.fromisoformat(tab['updatedAt'].replace('Z', '+00:00')).strftime('%d/%m/%Y')}"
            )
            lines.append("")

    def write_group(group: dict[str, Any], level: int) -> None:
        if allowed_groups is not None and group["id"] not in allowed_groups:
            return
        lines.append(f"{'#' * level} {group['name']}")
        lines.append("")
        write_tabs(group["id"])
        for child in children.get(group["id"], []):
            write_group(child, level + 1)

    for root in children.get(None, []):
        write_group(root, 2)
    if not group_filter:
        lines.append("## Inbox")
        lines.append("")
        write_tabs(None)
    return "\n".join(lines).strip() + "\n"


def markdown_import(content: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    document = empty_document()
    group_stack: dict[int, str | None] = {}
    active_group: str | None = None
    active_tab: dict[str, Any] | None = None
    errors: list[dict[str, Any]] = []
    header_re = re.compile(r"^(#{2,})\s+(.+?)\s*$")
    tab_re = re.compile(r"^-\s+\[(.+?)\]\((.+?)\)\s*$")
    metadata_re = re.compile(r"^\s{2,}([a-zA-Z]+):\s*(.*?)\s*$")
    for line_number, line in enumerate(content.splitlines(), start=1):
        if not line.strip():
            continue
        header = header_re.match(line)
        if header:
            level = len(header.group(1))
            name = header.group(2).strip()
            active_tab = None
            if name.lower() == "inbox":
                active_group = None
                continue
            parent = group_stack.get(level - 1)
            active_group = f"g-{safe_slug(name)}-{uuid.uuid4().hex[:8]}"
            document["groups"].append(
                {
                    "id": active_group,
                    "name": name,
                    "parentId": parent,
                    "color": None,
                    "position": len(document["groups"]),
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
            )
            group_stack[level] = active_group
            for key in list(group_stack):
                if key > level:
                    del group_stack[key]
            continue
        tab_match = tab_re.match(line)
        if tab_match:
            active_tab = {
                "id": str(uuid.uuid4()),
                "url": tab_match.group(2).strip(),
                "title": tab_match.group(1).strip(),
                "note": None,
                "tags": [],
                "groupId": active_group,
                "position": len(document["tabs"]),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            }
            document["tabs"].append(active_tab)
            continue
        metadata = metadata_re.match(line)
        if metadata and active_tab is not None:
            metadata_key = metadata.group(1)
            metadata_value = metadata.group(2) or ""
            if metadata_key == "id" and metadata_value:
                active_tab["id"] = metadata_value
            elif metadata_key == "tags":
                active_tab["tags"] = [
                    tag.strip() for tag in metadata_value.split(",") if tag.strip()
                ]
            elif metadata_key == "note":
                active_tab["note"] = metadata_value or None
            continue
        errors.append(
            issue(
                "E_MARKDOWN_PARSE_ERROR",
                f"line {line_number}",
                "a ## group heading, tab link, or indented metadata",
                line,
                "This line cannot be interpreted as TabVault Markdown.",
                "Use the documented TabVault Markdown grammar.",
            )
        )
    return (None, errors) if errors else (document, [])


def _merge_entity(
    existing: dict[str, Any], incoming: dict[str, Any], *, union_keys: tuple[str, ...] = ()
) -> dict[str, Any]:
    merged = {**existing, **incoming}
    for key in union_keys:
        left = existing.get(key) or []
        right = incoming.get(key) or []
        if isinstance(left, list) and isinstance(right, list):
            merged[key] = list(dict.fromkeys([*left, *right]))
    return merged


def _merge_duplicate_url_tab(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    incoming_tags = incoming.get("tags") or []
    existing_tags = existing.get("tags") or []
    if isinstance(existing_tags, list) and isinstance(incoming_tags, list):
        merged["tags"] = list(dict.fromkeys([*existing_tags, *incoming_tags]))
    for key, value in incoming.items():
        if key in {"id", "url", "createdAt", "tags"}:
            continue
        if merged.get(key) in (None, "", []):
            merged[key] = value
    if existing.get("archived") and not incoming.get("archived"):
        merged["archived"] = False
        merged["archivedAt"] = None
        if incoming.get("groupId") is not None:
            merged["groupId"] = incoming.get("groupId")
        if incoming.get("position") is not None:
            merged["position"] = incoming.get("position")
    return merged


def merge_documents(
    current: dict[str, Any], incoming: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    merged = copy.deepcopy(current)
    warnings: list[dict[str, str]] = []
    for key in ("tags", "groups"):
        existing = {
            item["name" if key == "tags" else "id"]: index for index, item in enumerate(merged[key])
        }
        identifier = "name" if key == "tags" else "id"
        for item in incoming[key]:
            if item[identifier] in existing:
                merged[key][existing[item[identifier]]] = _merge_entity(
                    merged[key][existing[item[identifier]]], item
                )
            else:
                existing[item[identifier]] = len(merged[key])
                merged[key].append(item)

    existing_tabs = {tab["id"]: index for index, tab in enumerate(merged["tabs"])}
    urls = {normalise_url(tab["url"]): tab["id"] for tab in merged["tabs"]}
    for tab in incoming["tabs"]:
        url = normalise_url(tab["url"])
        if tab["id"] in existing_tabs:
            index = existing_tabs[tab["id"]]
            merged["tabs"][index] = _merge_entity(merged["tabs"][index], tab, union_keys=("tags",))
        elif url in urls:
            existing_tab = merged["tabs"][existing_tabs[urls[url]]]
            merged["tabs"][existing_tabs[urls[url]]] = _merge_duplicate_url_tab(existing_tab, tab)
            restored = existing_tab.get("archived") and not tab.get("archived")
            warnings.append(
                warning(
                    "W_ARCHIVED_URL_RESTORED" if restored else "W_DUPLICATE_URL",
                    "tabs",
                    (
                        f"Restored archived tab {urls[url]!r} for {tab['url']} and merged incoming tags."
                        if restored
                        else f"Merged {tab['url']} into existing tab {urls[url]!r} instead of creating a duplicate."
                    ),
                )
            )
        else:
            merged["tabs"].append(tab)
            existing_tabs[tab["id"]] = len(merged["tabs"]) - 1
            urls[url] = tab["id"]
    return merged, warnings


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["upload", "replace"]
    format: Literal["json", "markdown"]
    content: Any


class TabPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    url: str = Field(min_length=1, max_length=4096)
    title: str = Field(min_length=1, max_length=1024)
    note: str | None = Field(default=None, max_length=20_000)
    tags: list[str] = Field(default_factory=list, max_length=64)
    groupId: str | None = None
    favicon: str | None = Field(default=None, max_length=4096)


class TabUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=1024)
    url: str | None = Field(default=None, min_length=1, max_length=4096)
    note: str | None = Field(default=None, max_length=20_000)
    tags: list[str] | None = Field(default=None, max_length=64)
    groupId: str | None = None
    position: int | None = Field(default=None, ge=0)
    favicon: str | None = Field(default=None, max_length=4096)
    archived: bool | None = None
    archivedAt: str | None = Field(default=None, max_length=64)


class RestoreTabPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=128)
    url: str = Field(min_length=1, max_length=4096)
    title: str = Field(min_length=1, max_length=1024)
    note: str | None = Field(default=None, max_length=20_000)
    tags: list[str] = Field(default_factory=list, max_length=64)
    groupId: str | None = None
    position: int = Field(default=0, ge=0)
    favicon: str | None = Field(default=None, max_length=4096)
    archived: bool = False
    archivedAt: str | None = Field(default=None, max_length=64)


class GroupPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=256)
    parentId: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=32)


class GroupUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=256)
    parentId: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=32)
    position: int | None = Field(default=None, ge=0)


class TagPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4096)


class HealthCheckPayload(BaseModel):
    intervalSeconds: int = Field(ge=0, le=86_400)
    notifyOnNeedsAttention: bool | None = None


bearer_scheme = HTTPBearer(
    bearerFormat="API Key",
    scheme_name="API Key",
    description=(
        "Paste the TabVault API key (`TABVAULT_API_KEY`). "
        "Swagger UI sends it as `Authorization: Bearer <key>`."
    ),
    auto_error=False,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    warn_open_cors()
    yield


app = FastAPI(
    title="TabVault API Server",
    version="0.2.0",
    description=(
        "Authenticated TabVault HTTP API. Use **Authorize** in Swagger UI to supply "
        "the bearer API key used by every data and status route."
    ),
    dependencies=[Depends(bearer_scheme)],
    swagger_ui_parameters={"persistAuthorization": True},
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if CORS_ALLOWS_ALL else ALLOWED_ORIGINS,
    allow_origin_regex=r".*" if CORS_ALLOWS_ALL else None,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["WWW-Authenticate"],
)


@app.middleware("http")
async def bearer_authentication(request: Request, call_next: Any) -> Any:
    """Protect every data and status route with a single explicit bearer key.

    OPTIONS is left to CORS middleware so browser preflight can succeed before the
    authenticated request supplies its Authorization header.
    """
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in {"/docs", "/openapi.json", "/redoc"}:
        return await call_next(request)
    expected = f"Bearer {API_KEY}"
    if request.headers.get("authorization") != expected:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Bearer API key required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "schemaVersion": SCHEMA_VERSION,
        "storagePath": str(store.path),
        "semanticIndex": semantic_index.status(),
        "healthCheck": health_scheduler.status(),
        "auth": "bearer",
    }


@app.get("/v1/library")
def library() -> dict[str, Any]:
    return store.read()


@app.delete("/v1/library")
def clear_library() -> dict[str, Any]:
    backup = store.backup()
    stored = persist_document(empty_document())
    return {
        "success": True,
        "cleared": True,
        "backup": str(backup) if backup else None,
        "document": stored,
    }


@app.get("/v1/schema")
def schema_definition() -> dict[str, Any]:
    schema_path = Path(__file__).parent.parent / "schema" / "v1.tabvault.schema.json"
    return cast(dict[str, Any], json.loads(schema_path.read_text(encoding="utf-8")))


@app.get("/v1/errors")
def error_catalog() -> dict[str, Any]:
    catalog_path = Path(__file__).parent.parent / "errors" / "catalog.json"
    return cast(dict[str, Any], json.loads(catalog_path.read_text(encoding="utf-8")))


@app.get("/v1/tabs")
def list_tabs(
    group: str | None = None, tag: str | None = None, fields: Literal["minimal", "full"] = "full"
) -> dict[str, Any]:
    document = store.read()
    results = [
        tab
        for tab in document["tabs"]
        if not tab.get("archived")
        and (group is None or tab.get("groupId") == group)
        and (tag is None or tag in tab.get("tags", []))
    ]
    if fields == "minimal":
        results = [
            {key: tab.get(key) for key in ("id", "url", "title", "tags", "groupId", "position")}
            for tab in results
        ]
    return {"tabs": results, "count": len(results)}


@app.get("/v1/search")
def search_tabs(q: str = Query(min_length=1), group: str | None = None) -> dict[str, Any]:
    document = store.read()
    allowed_ids = {
        tab["id"]
        for tab in document["tabs"]
        if not tab.get("archived") and (group is None or tab.get("groupId") == group)
    }
    try:
        scored = semantic_index.search(q, document)
        by_id = {tab["id"]: tab for tab in document["tabs"]}
        return {
            "mode": "semantic",
            "query": q,
            "group": group,
            "results": [
                {"tab": by_id[item["id"]], "score": item["score"]}
                for item in scored
                if item["id"] in allowed_ids
            ],
            "semanticIndex": semantic_index.status(),
        }
    except SemanticUnavailable as error:
        semantic_index.unavailable(error)
    terms = [term.lower() for term in re.findall(r"[\w-]+", q)]
    scored = []
    for tab in document["tabs"]:
        if tab["id"] not in allowed_ids or tab.get("archived"):
            continue
        haystack = " ".join(
            [tab.get("title", ""), tab.get("note") or "", " ".join(tab.get("tags", []))]
        ).lower()
        score = sum(term in haystack for term in terms)
        if score:
            scored.append({"tab": tab, "score": round(score / max(len(terms), 1), 2)})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return {
        "mode": "text_fallback",
        "query": q,
        "group": group,
        "results": scored,
        "semanticIndex": semantic_index.status(),
    }


@app.get("/v1/index/status")
def semantic_status() -> dict[str, Any]:
    return {**semantic_index.status(), "healthCheck": health_scheduler.status()}


@app.post("/v1/index/rebuild")
def rebuild_semantic_index() -> dict[str, Any]:
    return {"success": True, **index_scheduler.request_rebuild()}


@app.get("/v1/index/health-check")
def health_check_status() -> dict[str, Any]:
    return health_scheduler.status()


@app.put("/v1/index/health-check")
def configure_health_check(payload: HealthCheckPayload) -> dict[str, Any]:
    return health_scheduler.configure(payload.intervalSeconds, payload.notifyOnNeedsAttention)


@app.post("/v1/index/health-check/run")
def run_health_check() -> dict[str, Any]:
    return health_scheduler.check_now()


@app.post("/v1/tabs")
def save_tab(payload: TabPayload) -> dict[str, Any]:
    try:
        url = normalise_url(payload.url)
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=issue(
                "E_INVALID_URL",
                "url",
                "valid absolute URL (http/https)",
                payload.url,
                "URL must start with http:// or https://.",
                f"https://{payload.url.lstrip('/')}",
            ),
        ) from error
    document = store.read()
    if payload.groupId not in (None, "", "inbox") and not any(
        group["id"] == payload.groupId for group in document["groups"]
    ):
        raise HTTPException(status_code=422, detail="Group not found")
    duplicate = next((tab for tab in document["tabs"] if normalise_url(tab["url"]) == url), None)
    if duplicate:
        restored = bool(duplicate.get("archived"))
        if restored:
            duplicate["archived"] = False
            duplicate["archivedAt"] = None
        duplicate["updatedAt"] = now_iso()
        persist_document(normalise_document(document))
        return {"tab": duplicate, "deduplicated": True, "restored": restored}
    tab = {
        "id": str(uuid.uuid4()),
        "url": url,
        "title": payload.title.strip() or url,
        "favicon": payload.favicon,
        "note": payload.note,
        "tags": payload.tags,
        "groupId": payload.groupId,
        "archived": False,
        "archivedAt": None,
        "position": len(document["tabs"]),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    document["tabs"].append(tab)
    persist_document(normalise_document(document))
    return {"tab": tab, "deduplicated": False, "restored": False}


@app.post("/v1/tabs/restore")
def restore_tabs(tabs: list[RestoreTabPayload]) -> dict[str, Any]:
    """Restore tab records from a client-side undo snapshot; the JSON library remains authoritative."""
    document = store.read()
    by_id = {tab["id"]: tab for tab in document["tabs"]}
    restored = 0
    for payload in tabs:
        tab = payload.model_dump()
        tab["url"] = normalise_url(tab["url"])
        tab_id = tab["id"]
        duplicate = next(
            (
                item
                for item in document["tabs"]
                if item["id"] != tab_id and normalise_url(item["url"]) == tab["url"]
            ),
            None,
        )
        if duplicate:
            continue
        if tab_id in by_id:
            by_id[tab_id].update(copy.deepcopy(tab))
        else:
            document["tabs"].append(copy.deepcopy(tab))
            by_id[tab_id] = document["tabs"][-1]
        restored += 1
    persist_document(normalise_document(document))
    return {"restored": restored}


@app.get("/v1/tabs/{tab_id}")
def get_tab(tab_id: str) -> dict[str, Any]:
    tab = next((item for item in store.read()["tabs"] if item["id"] == tab_id), None)
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    return {"tab": tab}


@app.patch("/v1/tabs/{tab_id}")
def update_tab(tab_id: str, updates: TabUpdatePayload) -> dict[str, Any]:
    document = store.read()
    tab = next((item for item in document["tabs"] if item["id"] == tab_id), None)
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    changes = updates.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one tab field is required")
    if (
        "groupId" in changes
        and changes.get("groupId") not in (None, "", "inbox")
        and not any(group["id"] == changes["groupId"] for group in document["groups"])
    ):
        raise HTTPException(status_code=422, detail="Group not found")
    for field in (
        "title",
        "note",
        "tags",
        "groupId",
        "position",
        "favicon",
        "archived",
        "archivedAt",
    ):
        if field in changes:
            tab[field] = changes[field]
    if "url" in changes:
        normalized_url = normalise_url(str(changes["url"]))
        duplicate = next(
            (
                item
                for item in document["tabs"]
                if item["id"] != tab_id and normalise_url(item["url"]) == normalized_url
            ),
            None,
        )
        if duplicate:
            raise HTTPException(
                status_code=409, detail="A tab with this canonical URL already exists"
            )
        tab["url"] = normalized_url
    if changes.get("archived") is True and not tab.get("archivedAt"):
        tab["archivedAt"] = now_iso()
    if changes.get("archived") is False:
        tab["archivedAt"] = None
    tab["updatedAt"] = now_iso()
    persist_document(normalise_document(document))
    return {"tab": tab}


@app.delete("/v1/tabs/{tab_id}")
def delete_tab(tab_id: str) -> dict[str, bool]:
    document = store.read()
    target = next((tab for tab in document["tabs"] if tab["id"] == tab_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Tab not found")
    if not target.get("archived"):
        raise HTTPException(
            status_code=409,
            detail="Archive the tab before permanently deleting it.",
        )
    before = len(document["tabs"])
    document["tabs"] = [tab for tab in document["tabs"] if tab["id"] != tab_id]
    if len(document["tabs"]) == before:
        raise HTTPException(status_code=404, detail="Tab not found")
    persist_document(document)
    return {"deleted": True}


@app.get("/v1/groups")
def list_groups() -> dict[str, Any]:
    return {"groups": store.read()["groups"]}


@app.post("/v1/groups")
def create_group(payload: GroupPayload) -> dict[str, Any]:
    document = store.read()
    if payload.parentId and not any(
        group["id"] == payload.parentId for group in document["groups"]
    ):
        raise HTTPException(status_code=422, detail="Parent group not found")
    group = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "parentId": payload.parentId,
        "color": payload.color,
        "position": len(document["groups"]),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    document["groups"].append(group)
    persist_document(document)
    return {"group": group}


@app.patch("/v1/groups/{group_id}")
def update_group(group_id: str, updates: GroupUpdatePayload) -> dict[str, Any]:
    document = store.read()
    group = next((item for item in document["groups"] if item["id"] == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.update(updates.model_dump(exclude_unset=True))
    group["updatedAt"] = now_iso()
    errors, _ = validate_document(document)
    if errors:
        return {"success": False, "errors": errors, "warnings": []}
    persist_document(document)
    return {"success": True, "group": group}


@app.delete("/v1/groups/{group_id}")
def delete_group(group_id: str) -> dict[str, bool]:
    document = store.read()
    if not any(group["id"] == group_id for group in document["groups"]):
        raise HTTPException(status_code=404, detail="Group not found")
    child_ids = {group_id}
    changed = True
    while changed:
        changed = False
        for group in document["groups"]:
            if group.get("parentId") in child_ids and group["id"] not in child_ids:
                child_ids.add(group["id"])
                changed = True
    document["groups"] = [group for group in document["groups"] if group["id"] not in child_ids]
    for tab in document["tabs"]:
        if tab.get("groupId") in child_ids:
            tab["groupId"] = None
    persist_document(document)
    return {"deleted": True}


@app.get("/v1/tags")
def list_tags() -> dict[str, Any]:
    return {"tags": store.read()["tags"]}


@app.post("/v1/tags")
def add_tag(payload: TagPayload) -> dict[str, Any]:
    document = store.read()
    if any(tag["name"] == payload.name for tag in document["tags"]):
        raise HTTPException(status_code=409, detail="Tag already exists")
    tag = {"name": payload.name.strip(), "description": payload.description, "createdAt": now_iso()}
    document["tags"].append(tag)
    persist_document(document)
    return {"tag": tag}


@app.delete("/v1/tags/{tag_name}")
def remove_tag(tag_name: str) -> dict[str, bool]:
    document = store.read()
    document["tags"] = [tag for tag in document["tags"] if tag["name"] != tag_name]
    for tab in document["tabs"]:
        tab["tags"] = [tag for tag in tab.get("tags", []) if tag != tag_name]
    persist_document(document)
    return {"deleted": True}


@app.get("/v1/export")
def export_data(
    format: Literal["json", "markdown"] = "json", group: str | None = None, tag: str | None = None
) -> Any:
    document = store.read()
    if format == "markdown":
        return {"format": "markdown", "content": markdown_export(document, group, tag)}
    export = copy.deepcopy(document)
    if group:
        allowed = {group}
        export["tabs"] = [tab for tab in export["tabs"] if tab.get("groupId") in allowed]
    if tag:
        export["tabs"] = [tab for tab in export["tabs"] if tag in tab.get("tags", [])]
    return {"format": "json", "content": export}


@app.post("/v1/import")
def import_data(request: ImportRequest) -> dict[str, Any]:
    parse_errors: list[dict[str, Any]] = []
    incoming: dict[str, Any] | None
    if request.format == "json":
        if isinstance(request.content, str):
            try:
                incoming = json.loads(request.content)
            except json.JSONDecodeError as exc:
                incoming = None
                parse_errors.append(
                    issue(
                        "E_JSON_PARSE_ERROR",
                        f"line {exc.lineno}",
                        "valid JSON",
                        exc.msg,
                        "The JSON document could not be parsed.",
                        "Fix the reported JSON syntax and import again.",
                    )
                )
        else:
            incoming = request.content
    else:
        incoming, parse_errors = markdown_import(str(request.content))
    if parse_errors:
        return {"success": False, "errors": parse_errors, "warnings": []}
    if incoming is None:
        return {
            "success": False,
            "errors": [
                issue(
                    "E_INVALID_DOCUMENT",
                    "document",
                    "a JSON or Markdown document",
                    None,
                    "The import did not produce a document.",
                    "Provide a valid TabVault export and try again.",
                )
            ],
            "warnings": [],
        }
    errors, warnings = validate_document(incoming)
    if errors:
        return {"success": False, "errors": errors, "warnings": warnings}
    incoming = normalise_document(incoming)
    if request.mode == "replace":
        backup = store.backup()
        stored = persist_document(incoming)
        return {
            "success": True,
            "mode": "replace",
            "backup": str(backup) if backup else None,
            "warnings": warnings,
            "document": stored,
        }
    merged, merge_warnings = merge_documents(store.read(), incoming)
    stored = persist_document(normalise_document(merged))
    return {
        "success": True,
        "mode": "upload",
        "warnings": warnings + merge_warnings,
        "document": stored,
    }


def main() -> None:
    import uvicorn

    host = os.environ.get("TABVAULT_HOST", "127.0.0.1")
    port = int(os.environ.get("TABVAULT_PORT", "4817"))
    warn_open_cors()
    uvicorn.run("tabvault_server.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
