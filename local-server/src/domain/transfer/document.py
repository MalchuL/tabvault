"""Pure parsing, migration, and validation of portable library documents."""

from __future__ import annotations

import copy
import re
import uuid
from typing import Any
from urllib.parse import urlsplit

from lib.responses import IssueDTO, WarningDTO, issue
from lib.time import iso, utc_now


def empty_document() -> dict[str, Any]:
    """Create the schema-v3 document populated by Markdown import.

    Returns:
        dict[str, Any]: Serialized fields keyed for the caller.
    """
    return {
        "schemaVersion": 3,
        "exportedAt": iso(utc_now()),
        "propertySchema": {"viewed": {"description": "", "type": "boolean", "default": False}},
        "tags": [],
        "groups": [],
        "tabs": [],
    }


def migrate_v2_document(document: dict[str, Any]) -> dict[str, Any]:
    """Upgrade one portable v2 document to schema-driven v3 in memory.

    Args:
        document (dict[str, Any]): Parsed document that may use portable schema v2.

    Returns:
        dict[str, Any]: Deep-copied v3 document, or an unchanged-version copy when migration does
            not apply.
    """
    migrated = copy.deepcopy(document)
    if migrated.get("schemaVersion") != 2:
        return migrated
    migrated["schemaVersion"] = 3
    migrated["propertySchema"] = {
        "viewed": {"description": "", "type": "boolean", "default": False}
    }
    for tab in migrated.get("tabs", []):
        if isinstance(tab, dict):
            tab["customProperties"] = {"viewed": bool(tab.pop("viewed", False))}
    return migrated


def validate_document(document: Any) -> tuple[list[IssueDTO], list[WarningDTO]]:
    """Report malformed records and references before an import reaches persistence.

    Unknown tab tags are warnings because the import creates them.

    Args:
        document (Any): Parsed library document to validate or merge.

    Returns:
        tuple[list[IssueDTO], list[WarningDTO]]: Blocking validation issues and nonblocking
            warnings.
    """
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
    document = migrate_v2_document(document)
    if document.get("schemaVersion") != 3:
        errors.append(
            issue(
                "E_UNKNOWN_SCHEMA_VERSION",
                "$.schemaVersion",
                "3",
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
        for field in ("id", "name", "category"):
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
    tab_ids: set[str] = set()
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
        parsed = urlsplit(str(tab.get("url", "")))
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
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
        if group_id is not None and group_id not in group_ids:
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
    """Parse the Markdown interchange format, collecting line-specific errors.

    Args:
        content (str): Uploaded or generated document content.

    Returns:
        tuple[dict[str, Any] | None, list[IssueDTO]]: Parsed document, if valid, and any
            validation issues.
    """
    document = empty_document()
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
            name = header.group(2).strip()
            active_tab = None
            if name == "[Unassigned]":
                active_group = None
                active_group_record = None
                continue
            active_group = f"g-{uuid.uuid4()}"
            active_group_record = {
                "id": active_group,
                "name": name,
                "category": "manual",
                "description": "",
                "position": len(document["groups"]),
            }
            document["groups"].append(active_group_record)
        elif link:
            active_tab = {
                "id": str(uuid.uuid4()),
                "url": link.group(2),
                "title": link.group(1),
                "note": "",
                "agentReview": "",
                "customProperties": {"viewed": False},
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
                active_tab["customProperties"]["viewed"] = value.lower() == "true"
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
