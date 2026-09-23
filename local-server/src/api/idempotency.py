"""In-process idempotency middleware for tab creation requests."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict

from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response

from lib.responses import failure, issue, json_data


def register_idempotency(app: FastAPI, api_prefix: str) -> None:
    """Register bounded replay protection for tab creation requests.

    The local server runs one worker by default, so a process-local cache and lock are sufficient.
    JSON responses are retained for ten minutes and replayed only when the API key, path,
    idempotency key, query, and body match the original request.

    Args:
        app (FastAPI): Application receiving the middleware.
        api_prefix (str): Configured prefix used to identify supported creation routes.
    """
    cache: OrderedDict[tuple[str, str, str], tuple[float, str, int, dict[str, object]]] = (
        OrderedDict()
    )
    lock = asyncio.Lock()
    paths = {f"{api_prefix}/tabs", f"{api_prefix}/tabs/batch"}

    @app.middleware("http")
    async def idempotency(request, call_next):  # type: ignore[no-untyped-def]
        """Replay, reject, or record one idempotent tab creation response.

        Args:
            request (Request): Incoming request carrying the optional idempotency key.
            call_next (Callable): Next ASGI request handler.

        Returns:
            Response: Replayed, rejected, or newly produced HTTP response.
        """
        key = request.headers.get("idempotency-key")
        if request.method != "POST" or request.url.path not in paths or not key:
            return await call_next(request)
        body = await request.body()
        digest = hashlib.sha256(
            b"\0".join(
                [
                    request.method.encode(),
                    request.url.path.encode(),
                    request.url.query.encode(),
                    body,
                ]
            )
        ).hexdigest()
        cache_key = (request.headers.get("x-api-key", ""), request.url.path, key)
        # ponytail: one process-wide lock fits the local server; shard if throughput matters.
        async with lock:
            now = time.monotonic()
            while cache and next(iter(cache.values()))[0] <= now:
                cache.popitem(last=False)
            record = cache.get(cache_key)
            if record is not None:
                _expires, request_hash, status_code, response_body = record
                if request_hash != digest:
                    return JSONResponse(
                        json_data(
                            failure(
                                [
                                    issue(
                                        "E_IDEMPOTENCY_CONFLICT",
                                        "headers.Idempotency-Key",
                                        "same request",
                                        key,
                                        "This key was already used for a different request.",
                                        409,
                                    )
                                ]
                            )
                        ),
                        status_code=409,
                    )
                return JSONResponse(response_body, status_code=status_code)

            response = await call_next(request)
            chunks = [chunk async for chunk in response.body_iterator]
            payload = b"".join(chunks)
            try:
                decoded = json.loads(payload)
            except json.JSONDecodeError:
                return Response(
                    payload,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
            cache[cache_key] = (now + 600, digest, response.status_code, decoded)
            while len(cache) > 10_000:
                cache.popitem(last=False)
        headers = dict(response.headers)
        headers.pop("content-length", None)
        return JSONResponse(decoded, status_code=response.status_code, headers=headers)
