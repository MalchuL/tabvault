from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from alembic.config import Config

from alembic import command
from config.settings import get_settings


def test_schema_v3_migration_builds_only_the_fresh_model(tmp_path, monkeypatch) -> None:
    database = tmp_path / "fresh.sqlite3"
    monkeypatch.setenv("TABVAULT_DATABASE_URL", f"sqlite+aiosqlite:///{database}")
    get_settings.cache_clear()
    root = Path(__file__).parents[1]
    command.upgrade(Config(str(root / "alembic.ini")), "head")

    with sqlite3.connect(database) as connection:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "idempotency_keys" not in tables
        group_columns = {row[1] for row in connection.execute("PRAGMA table_info(groups)")}
        assert "category" in group_columns
        assert {"parent_id", "archived", "archived_at"}.isdisjoint(group_columns)
        tab_columns = {row[1] for row in connection.execute("PRAGMA table_info(tabs)")}
        assert "hidden_until" in tab_columns
        assert "custom_properties" in tab_columns
        assert "viewed" not in tab_columns
        assert "normalized_url" not in tab_columns
        assert "property_schemas" in tables
        properties = connection.execute(
            "SELECT properties FROM property_schemas WHERE id = 1"
        ).fetchone()
        assert properties is not None and json.loads(properties[0]) == {}
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260829_0002",
        )
    get_settings.cache_clear()
