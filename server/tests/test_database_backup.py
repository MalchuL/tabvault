"""Check manual database copies, authentication, and the server disable switch."""

import os
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from config.settings import Settings, SettingsDebug, get_settings
from domain.transfer.repository import TransferRepository


@pytest.fixture(autouse=True)
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "custom #database.sqlite3"
    monkeypatch.setenv("TABVAULT_STORAGE__DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    monkeypatch.setenv("TABVAULT_DEBUG__ENABLED", "true")
    return path


def test_database_backup_contains_current_wal_data_and_remains_a_snapshot(
    client: TestClient, headers: dict[str, str], database_path: Path, tmp_path: Path
) -> None:
    with closing(sqlite3.connect(database_path)) as live:
        live.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        created = client.post(
            "/api/v1/tabs",
            headers=headers,
            json={"id": "backup-tab", "content": {"url": "https://example.com/backup"}},
        )
        assert created.status_code == 201, created.text
        assert Path(str(database_path) + "-wal").stat().st_size > 0
        response = client.post("/api/v1/backups/database", headers=headers)
        assert response.status_code == 201, response.text
        path = Path(response.json()["data"]["path"])
        assert path.is_absolute() and path.parent == tmp_path / "backups"
        assert path.name.startswith("backup-") and path.suffix == ".sqlite3"
        assert path.stat().st_mode & 0o777 == 0o600
        with closing(sqlite3.connect(path)) as backup:
            assert backup.execute("PRAGMA integrity_check").fetchone() == ("ok",)
            assert backup.execute("SELECT id FROM tabs").fetchall() == [("backup-tab",)]
            assert backup.execute("SELECT schema_version FROM library_metadata").fetchone() == (5,)
            assert (
                client.post(
                    "/api/v1/tabs",
                    headers=headers,
                    json={"id": "later-tab", "content": {"url": "https://example.com/later"}},
                ).status_code
                == 201
            )
            assert backup.execute("SELECT COUNT(*) FROM tabs").fetchone() == (1,)
        second = client.post("/api/v1/backups/database", headers=headers)
        assert second.status_code == 201 and second.json()["data"]["path"] != str(path)
        with closing(sqlite3.connect(second.json()["data"]["path"])) as backup:
            assert backup.execute("SELECT COUNT(*) FROM tabs").fetchone() == (2,)


def test_database_backup_requires_authentication(client: TestClient, tmp_path: Path) -> None:
    for headers in ({}, {"X-API-Key": "wrong-key"}):
        assert client.post("/api/v1/backups/database", headers=headers).status_code == 401
    assert not list((tmp_path / "backups").glob("backup-*.sqlite3"))


def test_backup_routes_use_their_own_openapi_group(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    for path, method in (
        ("/api/v1/backups", "get"),
        ("/api/v1/backups/database", "post"),
        ("/api/v1/backups/{backup_id}/download", "get"),
        ("/api/v1/backups/{backup_id}/restore", "post"),
    ):
        assert paths[path][method]["tags"] == ["backups"]
    assert paths["/api/v1/export"]["get"]["tags"] == ["transfer"]


def test_database_backup_can_be_disabled_in_environment(
    client: TestClient, headers: dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert SettingsDebug().database_backup_enabled
    monkeypatch.setenv("TABVAULT_DEBUG__DATABASE_BACKUP_ENABLED", "false")
    get_settings.cache_clear()
    assert not Settings().debug.database_backup_enabled
    response = client.post("/api/v1/backups/database", headers=headers)
    assert response.status_code == 403
    assert response.json()["errors"][0]["code"] == "E_DATABASE_BACKUP_DISABLED"
    assert not list((tmp_path / "backups").glob("backup-*.sqlite3"))
    # Disabling manual copies must preserve the existing safety backups.
    assert client.delete("/api/v1/library", headers=headers).status_code == 200


def test_database_backup_requires_debug_mode(
    client: TestClient, headers: dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TABVAULT_DEBUG__ENABLED", "false")
    get_settings.cache_clear()
    assert client.post("/api/v1/backups/database", headers=headers).status_code == 403
    assert not list((tmp_path / "backups").glob("backup-*.sqlite3"))


def test_failed_database_copy_removes_partial_file(
    client: TestClient, headers: dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory = tmp_path / "backups"
    for index in range(31):
        (directory / f"backup-20000101T000000000000Z-{index:032x}.sqlite3").write_bytes(
            b"existing backup"
        )
    existing = set(directory.iterdir())

    async def fail_copy(self: TransferRepository, destination: Path) -> None:
        destination.write_bytes(b"incomplete")
        raise sqlite3.OperationalError("copy failed")

    monkeypatch.setattr(TransferRepository, "copy_database", fail_copy)
    with pytest.raises(sqlite3.OperationalError, match="copy failed"):
        client.post("/api/v1/backups/database", headers=headers)
    assert set(directory.iterdir()) == existing


def test_retention_keeps_latest_30_across_formats_and_removes_old_metadata(
    client: TestClient, headers: dict[str, str], tmp_path: Path, database_path: Path
) -> None:
    directory = tmp_path / "backups"
    startup = client.get("/api/v1/backups", headers=headers).json()["data"]["backups"][0]
    startup_file = next(directory.glob("*.json"))
    unrelated = directory / "notes.json"
    unrelated.write_text("keep me")
    unregistered_json = directory / "00000000-0000-0000-0000-000000000000.json"
    unregistered_json.write_text("important JSON")
    unrelated_sqlite = directory / "backup-user-notes.sqlite3"
    unrelated_sqlite.write_bytes(b"important database")
    important_file = tmp_path / "important.sqlite3"
    important_file.write_bytes(b"important symlink target")
    linked_backup = directory / f"backup-20000101T000000000000Z-{'f' * 32}.sqlite3"
    linked_backup.symlink_to(important_file)
    os.utime(important_file, ns=(1, 1))
    pending = directory / "backup-pending.tmp"
    pending.write_bytes(b"in progress")
    active_alias = directory / "backup-source.sqlite3"
    active_alias.symlink_to(database_path)
    copies = []
    for _ in range(31):
        response = client.post("/api/v1/backups/database", headers=headers)
        assert response.status_code == 201, response.text
        copies.append(Path(response.json()["data"]["path"]))
    assert not startup_file.exists() and not copies[0].exists()
    assert all(path.exists() for path in copies[1:])
    assert client.get("/api/v1/backups", headers=headers).json()["data"]["backups"] == []
    assert (
        client.get(f"/api/v1/backups/{startup['id']}/download", headers=headers).status_code == 404
    )

    cleared = client.delete("/api/v1/library", headers=headers)
    assert cleared.status_code == 200
    assert not copies[1].exists()
    empty = {"schemaVersion": 5, "library": {"tabs": [], "groups": [], "tags": []}}
    replaced = client.post("/api/v1/import?mode=replace", headers=headers, json=empty)
    assert replaced.status_code == 200, replaced.text
    assert not copies[2].exists()
    snapshots = client.get("/api/v1/backups", headers=headers).json()["data"]["backups"]
    assert {backup["reason"] for backup in snapshots} == {"clear_library", "pre_replace_import"}
    assert len(snapshots) + sum(path.exists() for path in copies) == 30
    assert unrelated.read_text() == "keep me" and pending.exists() and active_alias.exists()
    assert unregistered_json.read_text() == "important JSON"
    assert unrelated_sqlite.read_bytes() == b"important database"
    assert linked_backup.is_symlink() and important_file.read_bytes() == b"important symlink target"
    assert client.get("/api/v1/health", headers=headers).status_code == 200


def test_startup_prunes_existing_backups_without_creating_a_new_snapshot(
    client: TestClient, tmp_path: Path
) -> None:
    from api.main import create_app

    directory = tmp_path / "backups"
    existing = []
    for index in range(35):
        path = directory / f"backup-20000101T000000000000Z-{index:032x}.sqlite3"
        path.write_bytes(b"existing backup")
        os.utime(path, ns=(index + 1, index + 1))
        existing.append(path)
    # Keep the recent startup snapshot so restart tests pruning without creating another one.
    with TestClient(create_app()) as restarted:
        assert (
            restarted.get("/api/v1/backups", headers={"X-API-Key": "test-key"}).status_code == 200
        )
    assert all(not path.exists() for path in existing[:6])
    assert all(path.exists() for path in existing[6:])
    assert len(list(directory.glob("*.json"))) == 1


@pytest.mark.parametrize(
    "database_url", ["sqlite+aiosqlite:///:memory:", "postgresql://localhost/db"]
)
def test_unsupported_database_returns_error_without_leaving_a_copy(
    client: TestClient,
    headers: dict[str, str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    database_url: str,
) -> None:
    from db.session import get_engine

    monkeypatch.setattr(get_engine().sync_engine, "url", make_url(database_url))
    response = client.post("/api/v1/backups/database", headers=headers)
    assert response.status_code == 503
    assert response.json()["errors"][0]["code"] == "E_DATABASE_BACKUP_UNSUPPORTED"
    assert not list((tmp_path / "backups").glob("backup-*.sqlite3"))
