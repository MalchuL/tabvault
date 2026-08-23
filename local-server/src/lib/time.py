"""UTC time and serialization helpers."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime.

    This shared backend helper centralizes the behavior so API, domain, and infrastructure code use
    the same representation and edge-case handling.

    Returns:
        datetime: Result produced by the operation described above.
    """
    return datetime.now(UTC)


def absolute_utc(value: datetime) -> datetime:
    """Require an absolute datetime and normalize it to UTC.

    This shared backend helper centralizes the behavior so API, domain, and infrastructure code use
    the same representation and edge-case handling.

    Args:
        value (datetime): Value to validate, convert, or persist.

    Returns:
        datetime: Result produced by the operation described above.

    Raises:
        ValueError: Propagated when its documented validation or operation condition occurs.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must include a timezone")
    return value.astimezone(UTC)


def stored_utc(value: datetime | None) -> datetime | None:
    """Read a UTC database value, accounting for SQLite dropping timezone metadata.

    This shared backend helper centralizes the behavior so API, domain, and infrastructure code use
    the same representation and edge-case handling.

    Args:
        value (datetime | None): Value to validate, convert, or persist.

    Returns:
        datetime | None: Result produced by the operation described above.
    """
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def iso(value: datetime | None) -> str | None:
    """Serialize an optional datetime with a trailing UTC marker.

    This shared backend helper centralizes the behavior so API, domain, and infrastructure code use
    the same representation and edge-case handling.

    Args:
        value (datetime | None): Value to validate, convert, or persist.

    Returns:
        str | None: Result produced by the operation described above.
    """
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z") if value else None
