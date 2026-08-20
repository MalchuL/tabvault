from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Cursor:
    sort: str
    value: Any
    id: str


def encode_cursor(sort: str, value: Any, row_id: str) -> str:
    raw = json.dumps({"v": 1, "sort": sort, "value": value, "id": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(value: str, expected_sort: str) -> Cursor:
    try:
        payload = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        if payload.get("v") != 1 or payload.get("sort") != expected_sort:
            raise ValueError
        return Cursor(sort=payload["sort"], value=payload["value"], id=str(payload["id"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Invalid or incompatible cursor") from error
