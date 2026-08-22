from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic.config import Config

from alembic import command
from config.settings import get_settings


def test_metadata_migration_normalizes_existing_null_notes(tmp_path, monkeypatch) -> None:
    database = tmp_path / "old.sqlite3"
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            CREATE TABLE groups (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                parent_id VARCHAR(36),
                color VARCHAR(32),
                position FLOAT NOT NULL,
                archived BOOLEAN NOT NULL,
                archived_at DATETIME,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
            CREATE TABLE tabs (
                id VARCHAR(36) PRIMARY KEY,
                url TEXT NOT NULL,
                normalized_url TEXT NOT NULL,
                title VARCHAR(1024) NOT NULL,
                favicon_asset_id VARCHAR(36),
                note TEXT,
                group_id VARCHAR(36),
                position FLOAT NOT NULL,
                archived BOOLEAN NOT NULL,
                archived_at DATETIME,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
            CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
            INSERT INTO alembic_version VALUES ('20260821_0001');
            INSERT INTO groups VALUES (
                'group', 'Existing', NULL, NULL, 0, 0, NULL,
                '2026-01-01 00:00:00', '2026-01-01 00:00:00'
            );
            INSERT INTO tabs VALUES (
                'tab', 'https://example.com', 'https://example.com', 'Existing',
                NULL, NULL, 'group', 0, 0, NULL,
                '2026-01-01 00:00:00', '2026-01-01 00:00:00'
            );
            """
        )

    monkeypatch.setenv("TABVAULT_DATABASE_URL", f"sqlite+aiosqlite:///{database}")
    get_settings.cache_clear()
    root = Path(__file__).parents[1]
    command.upgrade(Config(str(root / "alembic.ini")), "head")

    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT note, agent_review, viewed FROM tabs WHERE id = 'tab'"
        ).fetchone() == ("", "", 0)
        assert connection.execute(
            "SELECT description FROM groups WHERE id = 'group'"
        ).fetchone() == ("",)
        tab_columns = {row[1]: row for row in connection.execute("PRAGMA table_info(tabs)")}
        assert tab_columns["note"][3] == 1
        assert tab_columns["agent_review"][3] == 1
        assert tab_columns["viewed"][3] == 1
    get_settings.cache_clear()
