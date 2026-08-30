from __future__ import annotations

import logging
from unittest.mock import AsyncMock

import pytest
from fastapi import Request, Response
from fastapi.testclient import TestClient
from starlette.responses import StreamingResponse

from api.request_logging import (
    MAX_LOGGED_BODY_CHARS,
    RequestLoggingMiddleware,
    describe_non_textual_response,
    is_textual_content,
    log_http_exchange,
    preview_body,
    request_target,
)
from config.settings import Settings, configure_logging


def test_configure_logging_restores_info_after_warning_reset() -> None:
    logging.getLogger().setLevel(logging.WARNING)
    configure_logging(Settings(log_level="INFO"))
    assert logging.getLogger().level == logging.INFO
    assert logging.getLogger("api.request").getEffectiveLevel() == logging.INFO
    assert logging.getLogger("uvicorn.access").level == logging.WARNING


def test_is_textual_content_accepts_json_and_text() -> None:
    assert is_textual_content("application/json; charset=utf-8")
    assert is_textual_content("text/markdown")
    assert not is_textual_content("image/png")
    assert not is_textual_content("")


def test_preview_body_compacts_json_and_truncates() -> None:
    assert preview_body(b"", "application/json") == ""
    assert (
        preview_body(b'{"success": true, "data": 1}', "application/json")
        == '{"success":true,"data":1}'
    )
    assert preview_body(b"not-json", "application/json") == "not-json"
    assert preview_body(b"plain", "text/plain") == "plain"

    oversized = b"x" * (MAX_LOGGED_BODY_CHARS + 20)
    preview = preview_body(oversized, "text/plain")
    assert preview.startswith("x" * MAX_LOGGED_BODY_CHARS)
    assert f"({len(oversized)} bytes)" in preview


def test_describe_non_textual_response_uses_headers() -> None:
    empty = Response(status_code=200)
    assert describe_non_textual_response(empty) == ""

    image = Response(status_code=200)
    image.headers["content-type"] = "image/png"
    image.headers["content-length"] = "128"
    assert describe_non_textual_response(image) == "image/png 128B"


def test_log_http_exchange_omits_empty_detail(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    request = Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/v1/health",
            "raw_path": b"/api/v1/health",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 9),
            "server": ("127.0.0.1", 80),
        }
    )
    log_http_exchange(request, 200, 1.5, "")
    messages = [record.getMessage() for record in caplog.records if record.name == "api.request"]
    assert messages == ["GET /api/v1/health -> 200 1.5ms"]


def test_request_target_includes_query_string() -> None:
    request = Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/v1/tabs",
            "raw_path": b"/api/v1/tabs",
            "query_string": b"limit=20",
            "headers": [],
            "client": ("127.0.0.1", 9),
            "server": ("127.0.0.1", 80),
        }
    )
    assert request_target(request) == "GET /api/v1/tabs?limit=20"


def test_health_request_logs_status_and_json_preview(
    client: TestClient, headers: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    response = client.get("/api/v1/health", headers=headers)
    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records if record.name == "api.request"]
    assert any(
        "GET /api/v1/health -> 200" in message and "schemaVersion" in message
        for message in messages
    )


def test_unauthorized_request_is_logged_as_warning(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    response = client.get("/api/v1/health")
    assert response.status_code == 401
    records = [record for record in caplog.records if record.name == "api.request"]
    assert records
    assert records[-1].levelno == logging.WARNING
    assert "GET /api/v1/health -> 401" in records[-1].getMessage()
    assert "E_UNAUTHORIZED" in records[-1].getMessage()


def test_binary_response_is_logged_without_body(
    client: TestClient, headers: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    response = client.get("/api/v1/assets/missing-preview", headers=headers)
    assert response.status_code in {200, 404}
    messages = [record.getMessage() for record in caplog.records if record.name == "api.request"]
    assert any("GET /api/v1/assets/missing-preview" in message for message in messages)


@pytest.mark.asyncio
async def test_middleware_logs_unhandled_exception(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="api.request")
    request = Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/boom",
            "raw_path": b"/boom",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 9),
            "server": ("127.0.0.1", 80),
        }
    )
    middleware = RequestLoggingMiddleware(app=AsyncMock())
    with pytest.raises(RuntimeError, match="nope"):
        await middleware.dispatch(request, AsyncMock(side_effect=RuntimeError("nope")))
    messages = [record.getMessage() for record in caplog.records if record.name == "api.request"]
    assert any(
        "GET /boom -> 500" in message and "unhandled exception" in message for message in messages
    )


@pytest.mark.asyncio
async def test_middleware_describes_non_textual_stream(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="api.request")
    request = Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/icon.png",
            "raw_path": b"/icon.png",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 9),
            "server": ("127.0.0.1", 80),
        }
    )
    image = StreamingResponse(iter([b"\x89PNG"]), media_type="image/png")
    image.headers["content-length"] = "4"
    middleware = RequestLoggingMiddleware(app=AsyncMock())
    response = await middleware.dispatch(request, AsyncMock(return_value=image))
    assert response is image
    messages = [record.getMessage() for record in caplog.records if record.name == "api.request"]
    assert any(
        "GET /icon.png -> 200" in message and "image/png 4B" in message for message in messages
    )
