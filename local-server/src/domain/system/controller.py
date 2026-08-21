"""HTTP routes for system, search, preview, and transfer use cases."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel

from api.routes.service_dependencies import get_system_service, get_transfer_service
from lib.responses import (
    SuccessResponseDTO,
    failure,
    issue,
    json_data,
    success,
)

from .dto import (
    BackupListDataDTO,
    ExportFields,
    HealthConfigDTO,
    HealthDTO,
    HealthScheduleDTO,
    ImportEnvelopeDTO,
    ImportMode,
    IndexStatusDTO,
    JobDTO,
    JobQueuedDTO,
    LibraryClearDTO,
    PreviewDTO,
    SearchDataDTO,
    SearchMode,
    TransferFormat,
)
from .service import SystemService
from .transfer import TransferService

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthDTO)
async def health(service: Annotated[SystemService, Depends(get_system_service)]) -> HealthDTO:
    """Return server and storage health."""
    return await service.health()


@router.get("/search", response_model=SuccessResponseDTO[SearchDataDTO])
async def search(
    service: Annotated[SystemService, Depends(get_system_service)],
    q: str = Query(min_length=1),
    mode: SearchMode = "hybrid",
    limit: int = Query(10, ge=1, le=50),
    group_id: str | None = Query(None, alias="groupId"),
    tags: str = "",
    min_score: float = Query(0.3, ge=0, le=1, alias="minScore"),
) -> SuccessResponseDTO[SearchDataDTO]:
    """Search tabs using keyword, semantic, or hybrid scoring."""
    result = await service.search(
        q, mode, limit, group_id, [x for x in tags.split(",") if x], min_score
    )
    return success(
        SearchDataDTO(results=result.results),
        meta=result.meta,
        warnings=result.warnings,
    )


@router.post(
    "/search/reindex",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def reindex(
    request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue a vector-index rebuild."""
    result = await service.queue_reindex()
    request.app.state.worker.wake()
    return success(result)


@router.get("/jobs/{job_id}", response_model=SuccessResponseDTO[JobDTO])
async def job(
    job_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobDTO]:
    """Return one background job."""
    return success(await service.job(job_id))


@router.get(
    "/backups",
    response_model=SuccessResponseDTO[BackupListDataDTO],
)
async def backups(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[BackupListDataDTO]:
    """List backup snapshots."""
    return success(BackupListDataDTO(backups=await service.backups()))


@router.post(
    "/backups/{backup_id}/restore",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def restore_backup(
    backup_id: str, request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue restoration of a backup snapshot."""
    result = await service.restore_backup(backup_id)
    request.app.state.worker.wake()
    return success(result)


@router.get(
    "/tabs/{tab_id}/preview",
    response_model=SuccessResponseDTO[PreviewDTO],
)
async def preview(
    tab_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[PreviewDTO]:
    """Return preview state for a tab."""
    return success(await service.preview(tab_id))


@router.post(
    "/tabs/{tab_id}/preview/refresh",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def refresh_preview(
    tab_id: str, request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue fresh preview capture for a tab."""
    result = await service.queue_preview(tab_id)
    request.app.state.worker.wake()
    return success(result)


@router.get("/assets/{asset_id}", response_class=FileResponse)
async def asset(
    asset_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> FileResponse:
    """Return a captured asset or bundled fallback."""
    result = await service.asset(asset_id)
    return FileResponse(result.path, media_type=result.media_type)


@router.get("/export")
async def export_data(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
    format: TransferFormat,
    scope: str = "all",
    include_subgroups: bool = Query(True, alias="includeSubgroups"),
    fields: ExportFields = "full",
) -> Response:
    """Export the library as portable JSON or Markdown."""
    result = await transfer.export(format, scope, include_subgroups, fields)
    filename = f"tabvault-export-{datetime.now(UTC).date()}.{format if format == 'json' else 'md'}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return (
        JSONResponse(
            json_data(result.content) if isinstance(result.content, BaseModel) else result.content,
            headers=headers,
        )
        if format == "json"
        else PlainTextResponse(str(result.content), media_type=result.media_type, headers=headers)
    )


async def _import_body(request: Request) -> tuple[object, TransferFormat]:
    """Read JSON or Markdown import content from a request."""
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
    mode: ImportMode | None = None,
    scope: str = "all",
) -> Response:
    """Validate and apply an imported library document."""
    content, format = await _import_body(request)
    if mode is None:
        try:
            envelope = ImportEnvelopeDTO.model_validate(await request.json())
            mode, format, content = envelope.mode, envelope.format, envelope.content
        except Exception:
            return JSONResponse(
                json_data(
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
                    )
                ),
                status_code=422,
            )
    result = await transfer.apply(content, format, mode, scope)
    return JSONResponse(json_data(result), status_code=200 if result.success else 422)


@router.post("/import/validate")
async def validate_import(
    request: Request, transfer: Annotated[TransferService, Depends(get_transfer_service)]
) -> Response:
    """Validate an import without applying it."""
    content, format = await _import_body(request)
    result = await transfer.validate(content, format)
    return JSONResponse(
        json_data(success(result) if result.valid else failure(result.errors, result.warnings)),
        status_code=200 if result.valid else 422,
    )


@router.get(
    "/index/status",
    response_model=SuccessResponseDTO[IndexStatusDTO],
)
async def index_status(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[IndexStatusDTO]:
    """Return vector-index status and health scheduling state."""
    return success(await service.index_status())


@router.get(
    "/index/health-check",
    response_model=SuccessResponseDTO[HealthScheduleDTO],
)
async def health_schedule(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Return vector-index health scheduling state."""
    return success((await service.index_status()).health_check)


@router.put(
    "/index/health-check",
    response_model=SuccessResponseDTO[HealthScheduleDTO],
)
async def configure_health(
    body: HealthConfigDTO, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Configure vector-index health scheduling."""
    return success(
        await service.configure_health(body.interval_seconds, body.notify_on_needs_attention)
    )


@router.post(
    "/index/health-check/run",
    response_model=SuccessResponseDTO[HealthScheduleDTO],
)
async def run_health(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Run a vector-index health check immediately."""
    return success(await service.run_health())


@router.get("/schema")
async def schema(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    """Return the portable-document JSON schema."""
    return service.schema()


@router.get("/errors")
async def errors(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    """Return the stable API error catalog."""
    return service.errors()


@router.delete("/library", response_model=SuccessResponseDTO[LibraryClearDTO])
async def clear_library(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[LibraryClearDTO]:
    """Back up and clear the local library."""
    return success(await service.clear_library())
