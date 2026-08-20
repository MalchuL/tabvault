from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from api.routes.service_dependencies import get_system_service, get_transfer_service
from lib.responses import failure, issue, success

from .dto import HealthConfigDTO, ImportEnvelopeDTO
from .service import SystemService
from .transfer import TransferService

router = APIRouter(tags=["system"])


@router.get("/health")
async def health(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return await service.health()


@router.get("/search")
async def search(
    service: Annotated[SystemService, Depends(get_system_service)],
    q: str = Query(min_length=1),
    mode: Literal["semantic", "keyword", "hybrid"] = "hybrid",
    limit: int = Query(10, ge=1, le=50),
    group_id: str | None = Query(None, alias="groupId"),
    tags: str = "",
    min_score: float = Query(0.3, ge=0, le=1, alias="minScore"),
) -> dict:
    result, warnings = await service.search(
        q, mode, limit, group_id, [x for x in tags.split(",") if x], min_score
    )
    return success({"results": result["results"]}, meta=result["meta"], warnings=warnings)


@router.post("/search/reindex", status_code=202)
async def reindex(
    request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> dict:
    result = await service.queue_reindex()
    request.app.state.worker.wake()
    return success(result)


@router.get("/jobs/{job_id}")
async def job(job_id: str, service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return success(await service.job(job_id))


@router.get("/backups")
async def backups(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return success({"backups": await service.backups()})


@router.post("/backups/{backup_id}/restore", status_code=202)
async def restore_backup(
    backup_id: str, request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> dict:
    result = await service.restore_backup(backup_id)
    request.app.state.worker.wake()
    return success(result)


@router.get("/tabs/{tab_id}/preview")
async def preview(
    tab_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> dict:
    return success(await service.preview(tab_id))


@router.post("/tabs/{tab_id}/preview/refresh", status_code=202)
async def refresh_preview(
    tab_id: str, request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> dict:
    result = await service.queue_preview(tab_id)
    request.app.state.worker.wake()
    return success(result)


@router.get("/assets/{asset_id}", response_class=FileResponse)
async def asset(
    asset_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> FileResponse:
    path, media_type = await service.asset(asset_id)
    return FileResponse(path, media_type=media_type)


@router.get("/export")
async def export_data(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
    format: Literal["json", "markdown"],
    scope: str = "all",
    include_subgroups: bool = Query(True, alias="includeSubgroups"),
    fields: Literal["full", "minimal"] = "full",
) -> Response:
    content, media_type = await transfer.export(format, scope, include_subgroups, fields)
    filename = f"tabvault-export-{datetime.now(UTC).date()}.{format if format == 'json' else 'md'}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return (
        JSONResponse(content, headers=headers)
        if format == "json"
        else PlainTextResponse(str(content), media_type=media_type, headers=headers)
    )


async def _import_body(request: Request) -> tuple[object, Literal["json", "markdown"]]:
    content_type = request.headers.get("content-type", "").split(";", 1)[0]
    raw = await request.body()
    if content_type == "text/markdown":
        return raw.decode("utf-8"), "markdown"
    if content_type == "application/json":
        value = json.loads(raw or b"{}")
        if isinstance(value, dict) and {"mode", "format", "content"}.issubset(value):
            return value["content"], value["format"]
        return value, "json"
    return raw.decode("utf-8"), "markdown"


@router.post("/import")
async def import_data(
    request: Request,
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
    mode: Literal["upload", "replace"] | None = None,
    scope: str = "all",
) -> Response:
    content, format = await _import_body(request)
    if mode is None:
        try:
            envelope = ImportEnvelopeDTO.model_validate(await request.json())
            mode, format, content = envelope.mode, envelope.format, envelope.content
        except Exception:
            return JSONResponse(
                failure(
                    [
                        issue(
                            "E_MISSING_MODE",
                            "query.mode",
                            "upload or replace",
                            None,
                            "Import mode is required.",
                            422,
                        )
                    ]
                ),
                status_code=422,
            )
    result = await transfer.apply(content, format, mode, scope)
    return JSONResponse(result, status_code=200 if result.get("success") else 422)


@router.post("/import/validate")
async def validate_import(
    request: Request, transfer: Annotated[TransferService, Depends(get_transfer_service)]
) -> Response:
    content, format = await _import_body(request)
    result = await transfer.validate(content, format)
    return JSONResponse(
        success(result) if result["valid"] else failure(result["errors"], result["warnings"]),
        status_code=200 if result["valid"] else 422,
    )


@router.get("/index/status")
async def index_status(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return success(await service.index_status())


@router.get("/index/health-check")
async def health_schedule(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return success((await service.index_status())["healthCheck"])


@router.put("/index/health-check")
async def configure_health(
    body: HealthConfigDTO, service: Annotated[SystemService, Depends(get_system_service)]
) -> dict:
    return success(
        await service.configure_health(body.interval_seconds, body.notify_on_needs_attention)
    )


@router.post("/index/health-check/run")
async def run_health(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return success(await service.run_health())


@router.get("/schema")
async def schema(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return service.schema()


@router.get("/errors")
async def errors(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return service.errors()


@router.delete("/library")
async def clear_library(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    return success(await service.clear_library())
