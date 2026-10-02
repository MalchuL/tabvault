from __future__ import annotations

import sqlite3

import pytest

from config.settings import Settings
from db.session import configure_database, dispose_database, initialize_database


@pytest.mark.asyncio
async def test_initialize_creates_only_the_current_schema(tmp_path) -> None:
    database = tmp_path / "fresh.sqlite3"
    settings = Settings(
        storage={"data_dir": tmp_path, "database_url": f"sqlite+aiosqlite:///{database}"}
    )
    engine, _ = configure_database(settings)
    try:
        await initialize_database(engine)
        await initialize_database(engine)
        with sqlite3.connect(database) as connection:
            tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
            }
            assert {"alembic_version", "idempotency_keys"}.isdisjoint(tables)
            group_columns = {row[1] for row in connection.execute("PRAGMA table_info(groups)")}
            assert "category" in group_columns
            assert {"parent_id", "archived", "archived_at"}.isdisjoint(group_columns)
            tab_columns = {row[1] for row in connection.execute("PRAGMA table_info(tabs)")}
            assert {"hidden_until", "custom_properties"} <= tab_columns
            assert {"viewed", "normalized_url"}.isdisjoint(tab_columns)
            assert "property_definitions" in tables
    finally:
        await dispose_database()
