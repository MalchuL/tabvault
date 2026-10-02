"""Pure parsing and validation of portable library documents."""

from __future__ import annotations

import re
import uuid
from typing import Any
from urllib.parse import urlsplit

from pydantic import ValidationError

from lib.responses import IssueDTO, WarningDTO, issue
from lib.time import iso, utc_now

from .dto import TransferDocumentDTO


def empty_document() -> dict[str, Any]:
    """Create the schema-v4 document populated by Markdown import.

    Returns:
        dict[str, Any]: Serialized fields keyed for the caller.
    """
    return {
        "schemaVersion": 4,
        "exportedAt": iso(utc_now()),
        "propertySchema": {"viewed": {"description": "", "type": "boolean", "default": False}},
        "library": {"tags": [], "groups": [], "tabs": []},
    }


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
    if document.get("schemaVersion") != 4:
        errors.append(
            issue(
                "E_UNKNOWN_SCHEMA_VERSION",
                "$.schemaVersion",
                "4",
                document.get("schemaVersion"),
                "Unsupported schema version.",
                422,
            )
        )
    library = document.get("library")
    if not isinstance(library, dict):
        errors.append(
            issue(
                "E_MISSING_REQUIRED_FIELD",
                "$.library",
                "object",
                library,
                "library must be an object.",
                422,
            )
        )
        return errors, warnings
    for key in ("tags", "groups", "tabs"):
        if not isinstance(library.get(key), list):
            errors.append(
                issue(
                    "E_MISSING_REQUIRED_FIELD",
                    f"$.library.{key}",
                    "array",
                    library.get(key),
                    f"{key} must be an array.",
                    422,
                )
            )
    if errors:
        return errors, warnings
    try:
        parsed = TransferDocumentDTO.model_validate(document)
    except ValidationError as error:
        for detail in error.errors():
            path = "$." + ".".join(str(part) for part in detail["loc"])
            code = (
                "E_MISSING_REQUIRED_FIELD" if detail["type"] == "missing" else "E_INVALID_DOCUMENT"
            )
            errors.append(
                issue(code, path, "valid schema-v4 field", detail.get("input"), detail["msg"], 422)
            )
        return errors, warnings
    group_ids: set[str] = set()
    for index, group in enumerate(parsed.library.groups):
        if (
            not group.id.strip()
            or not group.details.name.strip()
            or not group.details.category.strip()
        ):
            errors.append(
                issue(
                    "E_MISSING_REQUIRED_FIELD",
                    f"$.library.groups[{index}]",
                    "nonempty id, name, and category",
                    group.model_dump(by_alias=True),
                    "Group fields must not be blank.",
                    422,
                )
            )
        if group.id in group_ids:
            errors.append(
                issue(
                    "E_DUPLICATE_ID",
                    f"$.library.groups[{index}].id",
                    "unique id",
                    group.id,
                    "Group id is repeated.",
                    422,
                )
            )
        group_ids.add(group.id)
    tag_names = {tag.name for tag in parsed.library.tags}
    tab_ids: set[str] = set()
    for index, tab in enumerate(parsed.library.tabs):
        if not tab.id.strip() or not tab.content.title.strip():
            errors.append(
                issue(
                    "E_MISSING_REQUIRED_FIELD",
                    f"$.library.tabs[{index}].id",
                    "nonempty id and title",
                    tab.id,
                    "Tab id and title must not be blank.",
                    422,
                )
            )
        if tab.id in tab_ids:
            errors.append(
                issue(
                    "E_DUPLICATE_ID",
                    f"$.library.tabs[{index}].id",
                    "unique id",
                    tab.id,
                    "Tab id is repeated.",
                    422,
                )
            )
        tab_ids.add(tab.id)
        url = urlsplit(tab.content.url)
        if url.scheme.lower() not in {"http", "https"} or not url.netloc:
            errors.append(
                issue(
                    "E_INVALID_URL",
                    f"$.library.tabs[{index}].content.url",
                    "absolute http/https URL",
                    tab.content.url,
                    "URL must start with http:// or https://.",
                    422,
                )
            )
        if tab.placement.group_id is not None and tab.placement.group_id not in group_ids:
            errors.append(
                issue(
                    "E_UNKNOWN_GROUP_REFERENCE",
                    f"$.library.tabs[{index}].placement.groupId",
                    "existing group id or null",
                    tab.placement.group_id,
                    "Tab group does not exist.",
                    422,
                )
            )
        for tag_index, tag in enumerate(tab.annotations.tags):
            if tag not in tag_names:
                warnings.append(
                    WarningDTO(
                        code="W_ORPHAN_TAG",
                        path=f"$.library.tabs[{index}].annotations.tags[{tag_index}]",
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
                "details": {"name": name, "category": "manual", "description": ""},
                "placement": {"position": len(document["library"]["groups"])},
            }
            document["library"]["groups"].append(active_group_record)
        elif link:
            active_tab = {
                "id": str(uuid.uuid4()),
                "content": {"url": link.group(2), "title": link.group(1)},
                "annotations": {
                    "note": "",
                    "agentReview": "",
                    "customProperties": {"viewed": False},
                    "tags": [],
                },
                "placement": {
                    "groupId": active_group,
                    "position": len(document["library"]["tabs"]),
                },
            }
            document["library"]["tabs"].append(active_tab)
        elif metadata and active_tab is not None:
            key, value = metadata.groups()
            if key == "id" and value:
                active_tab["id"] = value
            elif key == "tags":
                active_tab["annotations"]["tags"] = [
                    item.strip() for item in value.split(",") if item.strip()
                ]
            elif key == "note":
                active_tab["annotations"]["note"] = value
            elif key == "agentReview":
                active_tab["annotations"]["agentReview"] = value
            elif key == "viewed":
                active_tab["annotations"]["customProperties"]["viewed"] = value.lower() == "true"
        elif metadata and active_group_record is not None:
            key, value = metadata.groups()
            if key == "description":
                active_group_record["details"]["description"] = value
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
