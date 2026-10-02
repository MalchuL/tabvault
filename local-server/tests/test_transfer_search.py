from __future__ import annotations

from fastapi.testclient import TestClient

from domain.transfer.document import markdown_import, validate_document
from domain.transfer.service import TransferService


def test_import_validate_export_replace_backup_and_clear(
    client: TestClient, headers: dict[str, str]
) -> None:
    document = {
        "schemaVersion": 5,
        "library": {
            "tags": [{"name": "docs", "description": "Documentation"}],
            "groups": [
                {
                    "id": "group-1",
                    "details": {"name": "Docs", "category": "manual"},
                    "placement": {"position": 0},
                }
            ],
            "tabs": [
                {
                    "id": "tab-1",
                    "content": {"url": "https://example.com/docs", "title": "Docs"},
                    "annotations": {"tags": ["docs"], "customProperties": {}},
                    "placement": {"groupId": "group-1", "position": 0},
                    "timestamps": {"updatedAt": "2026-01-01T00:00:00Z"},
                }
            ],
        },
    }
    validated = client.post("/api/v1/import/validate", headers=headers, json=document)
    assert validated.status_code == 200
    imported = client.post("/api/v1/import?mode=upload", headers=headers, json=document)
    assert imported.status_code == 200
    exported = client.get("/api/v1/export?format=json", headers=headers)
    assert exported.json()["schemaVersion"] == 5
    assert exported.json()["library"]["groups"][0]["details"]["category"] == "manual"
    assert exported.json()["library"]["tabs"][0]["placement"]["groupId"] == "group-1"
    markdown = client.get("/api/v1/export?format=markdown", headers=headers)
    assert "[Docs](https://example.com/docs)" in markdown.text
    invalid = client.post("/api/v1/import/validate", headers=headers, json={"schemaVersion": 99})
    assert invalid.status_code == 422
    cleared = client.delete("/api/v1/library", headers=headers)
    assert cleared.status_code == 200
    assert cleared.json()["data"]["backupSnapshotId"]
    assert client.get("/api/v1/backups", headers=headers).json()["data"]["backups"]


async def test_import_rejects_non_object_json_with_a_useful_error() -> None:
    service = object.__new__(TransferService)
    preview = await service.validate([], "json")
    applied = await service.apply([], "json", "upload")
    assert preview.valid is False
    assert applied.success is False
    assert preview.errors[0].code == applied.errors[0].code == "E_INVALID_DOCUMENT"


def test_merge_import_accepts_naive_updated_at(client: TestClient, headers: dict[str, str]) -> None:
    seed = {
        "schemaVersion": 5,
        "library": {
            "tags": [],
            "groups": [
                {
                    "id": "group-1",
                    "details": {"name": "Older", "category": "manual"},
                    "placement": {"position": 0},
                    "timestamps": {"updatedAt": "2026-01-01T00:00:00Z"},
                }
            ],
            "tabs": [],
        },
    }
    assert client.post("/api/v1/import?mode=upload", headers=headers, json=seed).status_code == 200
    newer = {
        "schemaVersion": 5,
        "library": {
            "tags": [],
            "groups": [
                {
                    "id": "group-1",
                    "details": {"name": "Newer", "category": "manual"},
                    "placement": {"position": 0},
                    "timestamps": {"updatedAt": "2026-06-01T00:00:00"},
                }
            ],
            "tabs": [],
        },
    }
    merged = client.post("/api/v1/import?mode=upload", headers=headers, json=newer)
    assert merged.status_code == 200
    assert merged.json()["success"] is True
    exported = client.get("/api/v1/export?format=json", headers=headers).json()
    assert exported["library"]["groups"][0]["details"]["name"] == "Newer"
    assert exported["library"]["groups"][0]["timestamps"]["updatedAt"].endswith("Z")
    stale = {
        "schemaVersion": 5,
        "library": {
            "tags": [],
            "groups": [
                {
                    "id": "group-1",
                    "details": {"name": "Stale", "category": "manual"},
                    "placement": {"position": 0},
                    "timestamps": {"updatedAt": "2025-01-01T00:00:00"},
                }
            ],
            "tabs": [],
        },
    }
    assert client.post("/api/v1/import?mode=upload", headers=headers, json=stale).status_code == 200
    assert (
        client.get("/api/v1/export?format=json", headers=headers).json()["library"]["groups"][0][
            "details"
        ]["name"]
        == "Newer"
    )


def test_document_validation_and_markdown_parser_collect_errors() -> None:
    errors, _ = validate_document(
        {
            "schemaVersion": 5,
            "library": {
                "groups": [{"id": "g", "details": {"name": "G", "category": "session"}}],
                "tags": [],
                "tabs": [
                    {
                        "id": "t",
                        "content": {"url": "bad", "title": ""},
                        "placement": {"groupId": "missing"},
                    }
                ],
            },
        }
    )
    assert {item.code for item in errors} >= {
        "E_UNKNOWN_GROUP_REFERENCE",
        "E_INVALID_URL",
        "E_MISSING_REQUIRED_FIELD",
    }
    document, parse_errors = markdown_import(
        "## Reading\n\n- [Example](https://example.com)\n  tags: docs"
    )
    assert not parse_errors
    assert document and document["library"]["tabs"][0]["annotations"]["tags"] == ["docs"]


def test_document_validation_exercises_duplicate_and_shape_errors() -> None:
    assert validate_document(["not", "an", "object"])[0][0].code == "E_INVALID_DOCUMENT"
    document = {
        "schemaVersion": 5,
        "library": {
            "tags": [{"name": "known"}],
            "groups": [
                {"id": "a", "details": {"name": "A", "category": "manual"}},
                {"id": "a", "details": {"name": "Duplicate", "category": "custom"}},
                {"id": "", "details": {"name": "", "category": ""}},
            ],
            "tabs": [
                {
                    "id": "t",
                    "content": {"url": "https://example.com", "title": "One"},
                    "annotations": {"tags": ["known"], "customProperties": {}},
                },
                {
                    "id": "t",
                    "content": {"url": "https://example.com/", "title": "Two"},
                    "annotations": {"tags": ["orphan"], "customProperties": {}},
                },
            ],
        },
    }
    errors, warnings = validate_document(document)
    codes = {item.code for item in errors}
    assert {"E_DUPLICATE_ID", "E_MISSING_REQUIRED_FIELD"} <= codes
    for record, value in (("tags", "bad-tag"), ("groups", "bad-group"), ("tabs", "bad-tab")):
        invalid = {**document, "library": {**document["library"], record: [value]}}
        assert validate_document(invalid)[0][0].code == "E_INVALID_DOCUMENT"
    invalid_tags = {
        **document,
        "library": {
            **document["library"],
            "tabs": [
                {
                    "id": "bad-tags",
                    "content": {"url": "https://example.com", "title": "Invalid tags"},
                    "annotations": {"tags": [1], "customProperties": {}},
                }
            ],
        },
    }
    assert validate_document(invalid_tags)[0][0].code == "E_INVALID_DOCUMENT"
    assert warnings[0].code == "W_ORPHAN_TAG"
    parsed, markdown_errors = markdown_import(
        "## [Unassigned]\n- [One](https://example.com)\n  id: fixed\n  note: hello\ninvalid"
    )
    assert parsed is None
    assert markdown_errors[0].code == "E_MARKDOWN_PARSE_ERROR"
