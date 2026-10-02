from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from lib.time import UtcDateTime, rfc3339, stored_utc


def test_stored_utc_treats_naive_values_as_utc() -> None:
    naive = datetime(2026, 8, 29, 20, 37, 37)
    aware = stored_utc(naive)
    assert aware is not None
    assert aware.tzinfo is not None
    assert aware.utcoffset() == UTC.utcoffset(aware)
    assert aware.replace(tzinfo=None) == naive


def test_rfc3339_emits_trailing_z_for_naive_and_aware() -> None:
    naive = datetime(2026, 8, 29, 20, 37, 37)
    aware = datetime(2026, 8, 29, 20, 37, 37, tzinfo=UTC)
    assert rfc3339(naive) == "2026-08-29T20:37:37Z"
    assert rfc3339(aware) == "2026-08-29T20:37:37Z"


def test_utc_datetime_sqlite_strips_timezone_on_bind_and_reattaches_on_read() -> None:
    column = UtcDateTime()
    sqlite = SimpleNamespace(name="sqlite")
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    bound = column.process_bind_param(aware, sqlite)
    assert bound == datetime(2026, 1, 1, 12, 0, 0)
    assert bound.tzinfo is None
    restored = column.process_result_value(bound, sqlite)
    assert restored == aware


def test_utc_datetime_other_dialects_keep_timezone_and_reject_naive_reads() -> None:
    column = UtcDateTime()
    postgres = SimpleNamespace(name="postgresql")
    naive = datetime(2026, 1, 1, 12, 0, 0)
    bound = column.process_bind_param(naive, postgres)
    assert bound is not None
    assert bound.tzinfo is not None
    with pytest.raises(ValueError, match="timezone-aware database"):
        column.process_result_value(naive, postgres)
