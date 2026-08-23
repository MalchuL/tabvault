"""UTC time and serialization helpers."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(UTC)


def absolute_utc(value: datetime) -> datetime:
    """Require an absolute datetime and normalize it to UTC."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must include a timezone")
    return value.astimezone(UTC)


def stored_utc(value: datetime | None) -> datetime | None:
    """Read a UTC database value, accounting for SQLite dropping timezone metadata."""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def iso(value: datetime | None) -> str | None:
    """Serialize an optional datetime with a trailing UTC marker."""
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z") if value else None
