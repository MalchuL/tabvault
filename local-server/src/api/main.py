from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from typing import Annotated

import uvicorn
from alembic.config import Config
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import APIKeyHeader
from sqlalchemy import delete, select

from alembic import command
from api.error_logging import register_error_handlers
from api.routes.api import api_router
from config.settings import Settings, configure_logging, get_settings
from db.session import configure_database, dispose_database, get_session_factory
from domain.system.jobs import JobWorker
from domain.system.search import LocalVectorIndex
from domain.system.transfer import TransferService
from lib.responses import failure, issue
from lib.time import utc_now
from models import Backup, IdempotencyRecord

logger = logging.getLogger(__name__)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, scheme_name="API Key")
ApiKeyDep = Annotated[str | None, Depends(api_key_header)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def require_api_key(value: ApiKeyDep, settings: SettingsDep) -> None:
    if settings.api_key and (value is None or not hmac.compare_digest(value, settings.api_key)):
        raise HTTPException(
            401,
            detail=issue(
                "E_UNAUTHORIZED",
                "headers.X-API-Key",
                "configured API key",
                None,
                "A valid X-API-Key is required.",
                401,
            ),
            headers={"WWW-Authenticate": "ApiKey"},
        )


def run_migrations() -> None:
    root = Path(__file__).parents[2]
    config = Config(str(root / "alembic.ini"))
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    if "*" in settings.cors_origins:
        logger.warning(
            "CORS is open to all origins (*); configure TABVAULT_CORS_ORIGINS before network exposure"
        )
    await asyncio.to_thread(run_migrations)
    engine, _session_factory = configure_database(settings)
    if settings.effective_database_url.startswith("sqlite"):
        async with engine.begin() as connection:
            await connection.exec_driver_sql("PRAGMA journal_mode=WAL")
    app.state.vectors = LocalVectorIndex(settings)
    app.state.worker = JobWorker(settings, app.state.vectors)
    async with get_session_factory()() as db:
        latest = await db.scalar(
            select(Backup).where(Backup.reason == "scheduled").order_by(Backup.created_at.desc())
        )
        if latest is None or latest.created_at.replace(
            tzinfo=latest.created_at.tzinfo or utc_now().tzinfo
        ) < utc_now() - timedelta(days=1):
            await TransferService(db, settings).create_backup("scheduled")
            await db.commit()
    await app.state.worker.start()
    yield
    await app.state.worker.stop()
    await dispose_database()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="TabVault API Server",
        version="0.2.0",
        lifespan=lifespan,
        swagger_ui_parameters={"persistAuthorization": True},
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @app.middleware("http")
    async def idempotency(request, call_next):  # type: ignore[no-untyped-def]
        key = request.headers.get("idempotency-key")
        if request.method != "POST" or not key:
            return await call_next(request)
        try:
            uuid.UUID(key)
        except ValueError:
            return JSONResponse(
                failure(
                    [
                        issue(
                            "E_INVALID_IDEMPOTENCY_KEY",
                            "headers.Idempotency-Key",
                            "UUID",
                            key,
                            "Idempotency-Key must be a UUID.",
                            422,
                        )
                    ]
                ),
                status_code=422,
            )
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
        async with get_session_factory()() as db:
            await db.execute(
                delete(IdempotencyRecord).where(IdempotencyRecord.expires_at < utc_now())
            )
            record = await db.get(IdempotencyRecord, key)
            if record:
                if record.request_hash != digest:
                    return JSONResponse(
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
                        ),
                        status_code=409,
                    )
                return JSONResponse(record.response, status_code=record.status_code)
            await db.commit()
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
        async with get_session_factory()() as db:
            db.add(
                IdempotencyRecord(
                    key=key,
                    request_hash=digest,
                    status_code=response.status_code,
                    response=decoded,
                    expires_at=utc_now() + timedelta(hours=24),
                )
            )
            await db.commit()
        headers = dict(response.headers)
        headers.pop("content-length", None)
        return JSONResponse(decoded, status_code=response.status_code, headers=headers)

    app.include_router(
        api_router, prefix=settings.api_prefix, dependencies=[Depends(require_api_key)]
    )
    register_error_handlers(app)
    return app


app = create_app()


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "api.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
