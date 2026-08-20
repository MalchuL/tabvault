from __future__ import annotations

from typing import Any


def success(
    data: Any, *, meta: dict[str, Any] | None = None, warnings: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    body: dict[str, Any] = {"success": True, "data": data}
    if meta is not None:
        body["meta"] = meta
    if warnings:
        body["warnings"] = warnings
    return body


def issue(
    code: str,
    path: str,
    expected: str,
    received: Any,
    message: str,
    http_status: int,
    suggested_fix: str | None = None,
) -> dict[str, Any]:
    item = {
        "code": code,
        "path": path,
        "expected": expected,
        "received": received,
        "message": message,
        "httpStatus": http_status,
    }
    if suggested_fix:
        item["suggestedFix"] = suggested_fix
    return item


def failure(
    errors: list[dict[str, Any]], warnings: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return {"success": False, "errors": errors, "warnings": warnings or []}
