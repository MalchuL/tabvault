"""Async SQLAlchemy engine and session lifecycle."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config.settings import Settings, get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def configure_database(
    settings: Settings | None = None,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Create the process engine and request-scoped session factory."""
    global _engine, _session_factory
    settings = settings or get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    _engine = create_async_engine(settings.effective_database_url, pool_pre_ping=True)

    if settings.effective_database_url.startswith("sqlite"):

        @event.listens_for(_engine.sync_engine, "connect")
        def configure_sqlite(dbapi_connection: object, _record: object) -> None:
            """Enable SQLite integrity and bounded lock waits."""
            cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    _session_factory = async_sessionmaker(_engine, expire_on_commit=False, autoflush=False)
    return _engine, _session_factory


def get_engine() -> AsyncEngine:
    """Return the configured engine, initializing it if needed."""
    global _engine
    if _engine is None:
        configure_database()
    assert _engine is not None
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the configured session factory, initializing it if needed."""
    global _session_factory
    if _session_factory is None:
        configure_database()
    assert _session_factory is not None
    return _session_factory


async def get_async_session() -> AsyncIterator[AsyncSession]:
    """Yield one request-scoped async database session."""
    async with get_session_factory()() as session:
        yield session


async def dispose_database() -> None:
    """Dispose the engine and clear process database state."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
