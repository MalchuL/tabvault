"""UTC time and serialization helpers."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(UTC)


def iso(value: datetime | None) -> str | None:
    """Serialize an optional datetime with a trailing UTC marker."""
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z") if value else None
