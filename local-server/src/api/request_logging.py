"""HTTP access logging for every request and its response preview."""

from __future__ import annotations

import json
import logging
import time
from contextlib import suppress
from typing import Any

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("api.request")

MAX_LOGGED_BODY_CHARS = 2_048
_TEXTUAL_CONTENT_MARKERS = ("application/json", "application/problem+json", "text/")


def is_textual_content(content_type: str) -> bool:
    """Return whether a Content-Type should be previewed in access logs.

    Binary asset downloads and streamed files stay unbuffered so a large preview or icon
    cannot be copied into the log line or held in memory just to describe the response.

    Args:
        content_type (str): Raw Content-Type header, which may include a charset parameter.

    Returns:
        bool: True when the media type is JSON or another text family that is safe to decode.
    """
    media_type = content_type.split(";", 1)[0].strip().lower()
    return any(marker in media_type for marker in _TEXTUAL_CONTENT_MARKERS)


def preview_body(body: bytes, content_type: str) -> str:
    """Build a single-line preview of a textual response body.

    JSON is compacted so the operator can see the envelope, error codes, and leading data
    without pretty-printed noise. Overlong bodies are truncated after
    ``MAX_LOGGED_BODY_CHARS`` and annotated with the original byte size.

    Args:
        body (bytes): Raw response payload already read from the ASGI iterator.
        content_type (str): Content-Type used to decide JSON compacting versus plain text.

    Returns:
        str: Compact preview, or an empty string when there is nothing useful to show.
    """
    if not body:
        return ""
    text = body.decode("utf-8", errors="replace")
    media_type = content_type.split(";", 1)[0].strip().lower()
    if "json" in media_type:
        with suppress(json.JSONDecodeError):
            text = json.dumps(json.loads(text), ensure_ascii=False, separators=(",", ":"))
    if len(text) > MAX_LOGGED_BODY_CHARS:
        return f"{text[:MAX_LOGGED_BODY_CHARS]}... ({len(body)} bytes)"
    return text


def describe_non_textual_response(response: Response) -> str:
    """Describe a binary or streamed response without reading its body.

    File downloads and preview images only contribute media type and Content-Length so the
    access line still explains what came back.

    Args:
        response (Response): Completed Starlette response whose headers are already populated.

    Returns:
        str: Short size/type note, or an empty string when neither header is present.
    """
    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
    content_length = response.headers.get("content-length")
    parts: list[str] = []
    if content_type:
        parts.append(content_type)
    if content_length and content_length != "0":
        parts.append(f"{content_length}B")
    return " ".join(parts)


def request_target(request: Request) -> str:
    """Format the method and URL path plus query string for an access line.

    Args:
        request (Request): Incoming Starlette request whose URL has already been parsed.

    Returns:
        str: Value such as ``GET /api/v1/tabs?limit=20``.
    """
    query = f"?{request.url.query}" if request.url.query else ""
    return f"{request.method} {request.url.path}{query}"


def log_http_exchange(request: Request, status_code: int, duration_ms: float, detail: str) -> None:
    """Write one access line for a completed or failed HTTP exchange.

    4xx and 5xx responses use WARNING so failures stand out beside successful traffic. The
    optional detail is the JSON/text preview or a binary size note.

    Args:
        request (Request): Original request used only for method, path, and query.
        status_code (int): Final HTTP status returned to the client, or 500 when the
            handler raised before a response existed.
        duration_ms (float): Wall time from middleware entry until the response was ready.
        detail (str): Compact body preview or media-type note; omitted when empty.
    """
    message = f"{request_target(request)} -> {status_code} {duration_ms:.1f}ms"
    if detail:
        message = f"{message} {detail}"
    level = logging.WARNING if status_code >= 400 else logging.INFO
    logger.log(level, message)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with status, duration, and a response preview.

    The middleware sits outside domain services so operators can follow local-server traffic
    without opening a debugger. JSON and text bodies are buffered only long enough to rebuild
    the response; file and streaming replies are left untouched.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Invoke the rest of the stack and record the outcome.

        Args:
            request (Request): Incoming HTTP request, including path and query string.
            call_next (RequestResponseEndpoint): Next ASGI handler, including CORS,
                idempotency, routing, and exception handlers.

        Returns:
            Response: The downstream response, rebuilt when its body was read for logging.
        """
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000
            log_http_exchange(request, 500, duration_ms, "unhandled exception")
            logger.exception("Request failed %s", request_target(request))
            raise

        duration_ms = (time.perf_counter() - started) * 1000
        content_type = response.headers.get("content-type", "")
        iterator = _body_iterator(response, content_type)
        if iterator is not None:
            body = b"".join([chunk async for chunk in iterator])
            log_http_exchange(
                request,
                response.status_code,
                duration_ms,
                preview_body(body, content_type),
            )
            headers = dict(response.headers)
            headers.pop("content-length", None)
            return Response(
                content=body,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type,
                background=response.background,
            )

        log_http_exchange(
            request,
            response.status_code,
            duration_ms,
            describe_non_textual_response(response),
        )
        return response


def _body_iterator(response: Response, content_type: str) -> Any:
    """Return the response body iterator when a textual preview is safe to build.

    ``BaseHTTPMiddleware`` wraps every downstream reply as a streaming response, so the
    decision uses Content-Type instead of the concrete class. Images and other binary
    downloads keep their iterators intact and are described from headers only.

    Args:
        response (Response): Downstream response produced by the application.
        content_type (str): Content-Type header already copied onto that response.

    Returns:
        Any: Async iterator of body chunks, or ``None`` when the body should not be read.
    """
    if not is_textual_content(content_type):
        return None
    return getattr(response, "body_iterator", None)


def register_request_logging(app: FastAPI) -> None:
    """Install access-logging middleware as the outermost HTTP wrapper.

    Call this after other ``add_middleware`` registrations so the access line records the
    status and headers the client actually receives, including CORS and error envelopes.

    Args:
        app (FastAPI): Application being configured by ``create_app``.
    """
    app.add_middleware(RequestLoggingMiddleware)
