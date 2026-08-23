"""Connect API page cursors to keyset-paginated database queries.

Purpose
-------
This module is pagination infrastructure for database-backed list endpoints.
It does not query the database itself. Instead, it transports the boundary
between two database queries as an opaque string that is safe to place in a
URL.

TabVault currently uses it when listing Saved Tabs. The first request has no
cursor::

    GET /api/v1/tabs?limit=50&sortBy=createdAt

The service fetches one page ordered by ``createdAt`` and ``id``. If another
page exists, it calls :func:`encode_cursor` with the last returned row's
creation time and ID, then exposes that token as ``meta.nextCursor``. The
client sends the token back on the next request::

    GET /api/v1/tabs?limit=50&sortBy=createdAt&cursor=<nextCursor>

The service calls :func:`decode_cursor`, and the repository converts the
decoded boundary into a parameterized SQL condition conceptually equivalent
to::

    created_at > cursor.value
    OR (created_at = cursor.value AND id > cursor.id)

The comparison operators are reversed for descending order. This technique
is called *keyset pagination*: the next query starts after a known row instead
of skipping an integer number of rows with ``OFFSET``. It remains more stable
when rows before the current page are inserted or deleted, and databases can
use an appropriate index to seek to the boundary.

Why the cursor contains both a value and an ID
-----------------------------------------------
Sort values are not necessarily unique. Several tabs can have the same
creation time or title. The row ID is the deterministic secondary sort key,
preventing equal-valued rows from being skipped or returned twice between
pages. The stored sort name also prevents a cursor created for ``createdAt``
from being reused accidentally with ``title`` ordering.

Encoding and trust boundary
---------------------------
The payload is versioned JSON encoded with URL-safe base64 and has the shape
``{"v": 1, "sort": ..., "value": ..., "id": ...}``. Clients should treat
that representation as opaque because it may change in a later cursor
version. Base64 makes it transportable; it does not encrypt or sign it.
Callers must use decoded values only through parameterized database
expressions, as the Saved Tab repository does.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Cursor:
    """Represent a decoded keyset-pagination boundary.

    Attributes:
        sort: API sort-key name that produced the cursor.
        value: JSON-decoded value of the final row's sort column. For example,
            this may be an integer position, an ISO-formatted timestamp, or a
            lowercase title depending on ``sort``.
        id: Final row ID used as a deterministic tie-breaker when sort values
            are equal.
    """

    sort: str
    value: Any
    id: str


def encode_cursor(sort: str, value: Any, row_id: str) -> str:
    """Encode a pagination boundary into an opaque URL-safe token.

    Args:
        sort: API sort-key name used by the current query.
        value: JSON-serializable sort value from the final returned row.
        row_id: Final row ID, used to make pagination deterministic when rows
            share the same sort value.

    Returns:
        A versioned, URL-safe base64 token without trailing padding.

    Raises:
        TypeError: The sort value cannot be serialized as JSON.
        ValueError: The payload contains a circular reference or another value
            rejected by the JSON encoder.
    """
    raw = json.dumps({"v": 1, "sort": sort, "value": value, "id": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(value: str, expected_sort: str) -> Cursor:
    """Decode a cursor and verify that it belongs to the requested ordering.

    Args:
        value: URL-safe cursor token supplied by a client. Base64 padding may
            be omitted, as it is by :func:`encode_cursor`.
        expected_sort: Sort-key name selected for the current query. A cursor
            created for another ordering is incompatible.

    Returns:
        The decoded sort value and deterministic row-ID boundary.

    Raises:
        ValueError: The token is malformed, uses an unsupported payload
            version, lacks required fields, or was created for a different
            sort key.
    """
    try:
        payload = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        if payload.get("v") != 1 or payload.get("sort") != expected_sort:
            raise ValueError
        return Cursor(sort=payload["sort"], value=payload["value"], id=str(payload["id"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Invalid or incompatible cursor") from error
