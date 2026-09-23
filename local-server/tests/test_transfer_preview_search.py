from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from clients.web_capture.client import CaptureRejectedError, WebCaptureClient
from clients.web_capture.protocol import CapturedResponse
from config.settings import Settings
from db.session import configure_database
from domain.indexing.vector_index import LocalVectorIndex
from domain.previews.repository import PreviewRepository
from domain.previews.service import PreviewService
from domain.transfer.document import markdown_import, validate_document
from domain.transfer.service import TransferService
from models import Base, Tab


def test_import_validate_export_replace_backup_and_clear(
    client: TestClient, headers: dict[str, str]
) -> None:
    document = {
        "schemaVersion": 2,
        "tags": [{"name": "docs", "description": "Documentation"}],
        "groups": [{"id": "group-1", "name": "Docs", "category": "manual", "position": 0}],
        "tabs": [
            {
                "id": "tab-1",
                "url": "https://example.com/docs",
                "title": "Docs",
                "tags": ["docs"],
                "groupId": "group-1",
                "position": 0,
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        ],
    }
    validated = client.post("/api/v1/import/validate", headers=headers, json=document)
    assert validated.status_code == 200
    imported = client.post("/api/v1/import?mode=upload", headers=headers, json=document)
    assert imported.status_code == 200
    exported = client.get("/api/v1/export?format=json", headers=headers)
    assert exported.json()["schemaVersion"] == 3
    assert exported.json()["groups"][0]["category"] == "manual"
    assert exported.json()["tabs"][0]["groupId"] == "group-1"
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
        "schemaVersion": 2,
        "tags": [],
        "groups": [
            {
                "id": "group-1",
                "name": "Older",
                "category": "manual",
                "position": 0,
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        ],
        "tabs": [],
    }
    assert client.post("/api/v1/import?mode=upload", headers=headers, json=seed).status_code == 200

    newer = {
        "schemaVersion": 2,
        "tags": [],
        "groups": [
            {
                "id": "group-1",
                "name": "Newer",
                "category": "manual",
                "position": 0,
                "updatedAt": "2026-06-01T00:00:00",
            }
        ],
        "tabs": [],
    }
    merged = client.post("/api/v1/import?mode=upload", headers=headers, json=newer)
    assert merged.status_code == 200
    assert merged.json()["success"] is True
    exported = client.get("/api/v1/export?format=json", headers=headers).json()
    assert exported["groups"][0]["name"] == "Newer"
    assert exported["groups"][0]["updatedAt"].endswith("Z")

    stale = {
        "schemaVersion": 2,
        "tags": [],
        "groups": [
            {
                "id": "group-1",
                "name": "Stale",
                "category": "manual",
                "position": 0,
                "updatedAt": "2025-01-01T00:00:00",
            }
        ],
        "tabs": [],
    }
    assert client.post("/api/v1/import?mode=upload", headers=headers, json=stale).status_code == 200
    assert (
        client.get("/api/v1/export?format=json", headers=headers).json()["groups"][0]["name"]
        == "Newer"
    )


def test_document_validation_and_markdown_parser_collect_errors() -> None:
    errors, _ = validate_document(
        {
            "schemaVersion": 2,
            "groups": [{"id": "g", "name": "G", "category": "session"}],
            "tags": [],
            "tabs": [{"id": "t", "url": "bad", "title": "", "groupId": "missing"}],
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
    assert document and document["tabs"][0]["tags"] == ["docs"]


def test_document_validation_exercises_duplicate_and_shape_errors() -> None:
    assert validate_document(["not", "an", "object"])[0][0].code == "E_INVALID_DOCUMENT"
    document = {
        "schemaVersion": 2,
        "tags": [{"name": "known"}, "bad-tag"],
        "groups": [
            "bad-group",
            {"id": "a", "name": "A", "category": "manual"},
            {"id": "a", "name": "Duplicate", "category": "custom"},
            {"id": "", "name": "", "category": ""},
        ],
        "tabs": [
            "bad-tab",
            {"id": "t", "url": "https://example.com", "title": "One", "tags": [1]},
            {
                "id": "t",
                "url": "https://example.com/",
                "title": "Two",
                "tags": ["orphan"],
            },
        ],
    }
    errors, warnings = validate_document(document)
    codes = {item.code for item in errors}
    assert {
        "E_INVALID_OBJECT",
        "E_DUPLICATE_ID",
        "E_INVALID_TAGS",
    } <= codes
    assert warnings[0].code == "W_ORPHAN_TAG"
    parsed, markdown_errors = markdown_import(
        "## [Unassigned]\n- [One](https://example.com)\n  id: fixed\n  note: hello\ninvalid"
    )
    assert parsed is None
    assert markdown_errors[0].code == "E_MARKDOWN_PARSE_ERROR"


@pytest.mark.asyncio
async def test_web_capture_rejects_private_hosts(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    settings = Settings(data_dir=tmp_path)
    client = WebCaptureClient(settings)

    async def private_address(*_args: object, **_kwargs: object):
        return [(None, None, None, None, ("127.0.0.1", 80))]

    monkeypatch.setattr("asyncio.BaseEventLoop.getaddrinfo", private_address)
    with pytest.raises(CaptureRejectedError):
        await client._validate_url("http://localhost/private")
    with pytest.raises(CaptureRejectedError):
        await client._validate_url("file:///etc/passwd")


class FakeCapture:
    def __init__(self) -> None:
        self.image_urls: list[str] = []

    async def fetch_html(self, url: str) -> CapturedResponse:
        return CapturedResponse(
            (
                b'<html><head><title>Reader</title></head><body><div id="nav">'
                b'Navigation noise<img src="/outside.png"></div><main><article><h1>Reader</h1>'
                b"<script>alert(1)</script><p>"
                + b"Useful text for the main article. " * 30
                + b'</p><img src="/first.png"><p>'
                + b"More useful article text follows the representative image. " * 20
                + b'</p><img src="/second.png"></article></main>'
                b'<div id="footer">Footer noise</div></body></html>'
            ),
            "text/html",
            url,
        )

    async def fetch_image(self, url: str) -> CapturedResponse:
        self.image_urls.append(url)
        return CapturedResponse(b"fake-image", "image/png", url)


@pytest.mark.asyncio
async def test_preview_sanitizes_rewrites_and_stores_assets(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path, database_url=f"sqlite+aiosqlite:///{tmp_path / 'preview.db'}"
    )
    engine, factory = configure_database(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        tab = Tab(
            url="https://example.com/article",
            title="https://example.com/article",
            note="",
            group_id=None,
            position=0,
            archived=False,
            archived_at=None,
        )
        db.add(tab)
        await db.commit()
        capture = FakeCapture()
        result = await PreviewService(db, settings, capture, PreviewRepository(db)).capture_tab(
            tab.id
        )
        assert result.status == "ready"
        preview = await db.get(__import__("models").Preview, tab.id)
        assert preview and "script" not in (preview.content_html or "")
        assert "Navigation noise" not in (preview.content_html or "")
        assert (preview.content_html or "").count("<img") == 1
        assert "tabvault-asset://" in (preview.content_html or "")
        assert "https://example.com/first.png" in capture.image_urls
        assert "https://example.com/second.png" not in capture.image_urls
        assert "https://example.com/outside.png" not in capture.image_urls
        assert settings.asset_dir.joinpath("images").exists()
    await engine.dispose()


def test_real_temporary_zvec_collection_without_model_download(tmp_path: Path) -> None:
    class FakeModel:
        def encode(self, texts, **_kwargs):
            import numpy as np

            return np.array([[1.0, 0.0] if "python" in text else [0.0, 1.0] for text in texts])

    index = LocalVectorIndex(Settings(data_dir=tmp_path))
    index._model = FakeModel()
    assert index._rebuild_sync([("a", "python"), ("b", "gardening")]) == 2
    assert index._search_sync("python", 1)[0][0] == "a"


@pytest.mark.asyncio
async def test_vector_async_success_empty_reopen_and_failure(tmp_path: Path) -> None:
    class FakeModel:
        def encode(self, texts, **_kwargs):
            import numpy as np

            return np.array([[1.0, 0.0] for _text in texts])

    index = LocalVectorIndex(Settings(data_dir=tmp_path))
    index._model = FakeModel()
    assert await index.rebuild([("a", "python")]) == 1
    assert index.status().status == "ready"
    index._collection = None
    assert index._open_or_create(2) is not None
    assert await index.search("python", 1)
    assert await index.rebuild([]) == 0

    def fail(*_args, **_kwargs):
        raise RuntimeError("model unavailable")

    index._rebuild_sync = fail
    with pytest.raises(RuntimeError):
        await index.rebuild([("a", "python")])
    index._search_sync = fail
    with pytest.raises(RuntimeError):
        await index.search("python", 1)
    assert index.last_error == "model unavailable"
