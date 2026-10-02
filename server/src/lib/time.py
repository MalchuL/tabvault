"""UTC time, wire serialization, and dialect-aware persistence helpers."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


def utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime.

    Application code uses this instead of naive ``utcnow()`` so newly written instants are
    absolute. SQLite still stores them without timezone metadata; ``UtcDateTime`` reattaches UTC
    on read.

    Returns:
        datetime: The current UTC instant with ``tzinfo`` set.
    """
    return datetime.now(UTC)


def absolute_utc(value: datetime) -> datetime:
    """Require an absolute datetime and normalize it to UTC.

    Use this only for fields that must already include a timezone. Import, sync, and other
    untrusted JSON should call ``stored_utc`` instead so a missing offset is treated as UTC.

    Args:
        value (datetime): Instant that must already include a timezone.

    Returns:
        datetime: The same instant expressed in UTC.

    Raises:
        ValueError: ``value`` is naive or has a ``tzinfo`` whose offset is unknown.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must include a timezone")
    return value.astimezone(UTC)


def stored_utc(value: datetime | None) -> datetime | None:
    """Treat a naive instant as UTC and convert an aware instant to UTC.

    JSON clients and older portable documents may omit ``Z``. SQLite also returns naive UTC
    values. This helper never interprets naive values in the process local timezone, which would
    shift the stored instant.

    Args:
        value (datetime | None): Instant from JSON, a DTO, or a SQLite result.

    Returns:
        datetime | None: ``None`` when ``value`` is ``None``, otherwise a UTC-aware instant.
    """
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def iso(value: datetime | None) -> str | None:
    """Serialize an optional datetime as RFC 3339 UTC with a trailing ``Z``.

    Args:
        value (datetime | None): Instant to serialize. Naive values are interpreted as UTC.

    Returns:
        str | None: RFC 3339 timestamp, or ``None`` when ``value`` is ``None``.
    """
    return rfc3339(value) if value else None


def rfc3339(value: datetime) -> str:
    """Serialize a datetime as an RFC 3339 UTC instant with a trailing ``Z``.

    Args:
        value (datetime): Instant to serialize. Naive values are interpreted as UTC.

    Returns:
        str: RFC 3339 timestamp ending in ``Z``.
    """
    aware = stored_utc(value)
    assert aware is not None
    return aware.isoformat().replace("+00:00", "Z")


class UtcDateTime(TypeDecorator[datetime]):
    """Persist UTC instants, compensating only for SQLite dropping timezone metadata.

    Writers always normalize to UTC. SQLite has no timezone-aware datetime type, so the bind
    path stores a naive UTC value and the result path assumes that naive value is UTC. Other
    dialects keep timezone-aware values; a naive result from those engines is an error rather
    than a silent UTC assumption.

    Attributes:
        impl (DateTime): Underlying SQLAlchemy datetime type with timezone enabled.
        cache_ok (bool): Whether SQLAlchemy may cache this type.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Normalize a UTC instant for the current dialect before INSERT or UPDATE.

        Naive values are treated as UTC. SQLite cannot store timezone metadata, so the offset is
        stripped after normalization. Other dialects receive an aware UTC instant.

        Args:
            value (datetime | None): Instant supplied by application code.
            dialect (Dialect): Active SQLAlchemy dialect, used only to detect SQLite.

        Returns:
            datetime | None: Naive UTC for SQLite, aware UTC for other dialects, or ``None``.
        """
        aware = stored_utc(value)
        if aware is None:
            return None
        if dialect.name == "sqlite":
            return aware.replace(tzinfo=None)
        return aware

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Restore a UTC-aware instant after a database read.

        SQLite results are naive by convention and are interpreted as UTC. Other dialects must
        already return an aware instant.

        Args:
            value (datetime | None): Raw datetime from the driver.
            dialect (Dialect): Active SQLAlchemy dialect, used only to detect SQLite.

        Returns:
            datetime | None: UTC-aware instant, or ``None`` when the column is null.

        Raises:
            ValueError: A non-SQLite dialect returned a naive datetime.
        """
        if value is None:
            return None
        if dialect.name == "sqlite":
            return stored_utc(value)
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime from a timezone-aware database must include a timezone")
        return value.astimezone(UTC)
