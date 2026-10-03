"""Async SQLAlchemy engine and session lifecycle."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event, insert, inspect, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config.settings import Settings, get_settings
from models import Base, LibraryMetadata

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def configure_database(
    settings: Settings | None = None,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Create the process engine and request-scoped session factory.

    Args:
        settings (Settings | None): Settings for the engine, or ``None`` to load process defaults.

    Returns:
        tuple[AsyncEngine, async_sessionmaker[AsyncSession]]: Engine and factory for new sessions;
            callers own their transaction commits.
    """
    global _engine, _session_factory
    settings = settings or get_settings()
    settings.storage.data_dir.mkdir(parents=True, exist_ok=True)
    _engine = create_async_engine(settings.storage.effective_database_url, pool_pre_ping=True)

    if settings.storage.effective_database_url.startswith("sqlite"):

        @event.listens_for(_engine.sync_engine, "connect")
        def configure_sqlite(dbapi_connection: object, _record: object) -> None:
            """Enable SQLite integrity and bounded lock waits.

            Args:
                dbapi_connection (object): SQLite DB-API connection receiving PRAGMA settings.
                _record (object): SQLAlchemy connection record, unused by this hook.
            """
            cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    _session_factory = async_sessionmaker(_engine, expire_on_commit=False, autoflush=False)
    return _engine, _session_factory


def get_engine() -> AsyncEngine:
    """Return the configured engine, initializing it if needed.

    Returns:
        AsyncEngine: Reusable async engine configured for the current settings.
    """
    global _engine
    if _engine is None:
        configure_database()
    assert _engine is not None
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the configured session factory, initializing it if needed.

    Returns:
        async_sessionmaker[AsyncSession]: Factory that opens request-scoped asynchronous sessions.
    """
    global _session_factory
    if _session_factory is None:
        configure_database()
    assert _session_factory is not None
    return _session_factory


async def get_async_session() -> AsyncIterator[AsyncSession]:
    """Yield one request-scoped async database session.

    Returns:
        AsyncIterator[AsyncSession]: One async session, closed after the request finishes.
    """
    async with get_session_factory()() as session:
        yield session


async def dispose_database() -> None:
    """Dispose the engine and clear process database state."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def initialize_database(engine: AsyncEngine) -> None:
    """Create the current tables without upgrading existing schemas or converting data.

    Args:
        engine (AsyncEngine): Configured engine for the process-owned database.
    """
    async with engine.begin() as connection:
        tables = await connection.run_sync(lambda conn: inspect(conn).get_table_names())
        if tables and "library_metadata" not in tables:
            raise RuntimeError(
                "Incompatible database. Export with the previous version and choose a fresh schema-v5 database; no data was modified."
            )
        if "library_metadata" in tables:
            version = await connection.scalar(
                select(LibraryMetadata.schema_version).where(LibraryMetadata.id == 1)
            )
            if version != 5:
                raise RuntimeError(
                    "Incompatible database schema; expected v5. No data was modified."
                )
        await connection.run_sync(Base.metadata.create_all)
        if not tables:
            await connection.execute(insert(LibraryMetadata).values(id=1, schema_version=5))
