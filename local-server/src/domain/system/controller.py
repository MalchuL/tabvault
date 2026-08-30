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
    CapabilitiesDTO,
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
    """Return server and storage health.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        HealthDTO: Result produced by the operation described above.
    """
    return await service.health()


@router.get("/capabilities", response_model=SuccessResponseDTO[CapabilitiesDTO])
async def capabilities(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[CapabilitiesDTO]:
    """Return which local-server features are available in this process.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[CapabilitiesDTO]: Keyword, semantic-runtime, and vector-index
            availability, including an error and fix when a feature is unavailable.
    """
    return success(await service.capabilities())


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
    """Search tabs using keyword, semantic, or hybrid scoring.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.
        q (str): Q value consumed by this operation.
        mode (SearchMode): Requested import or update behavior.
        limit (int): Maximum number of matching records to return.
        group_id (str | None): Stable identifier of the group targeted by the operation.
        tags (str): Tags value consumed by this operation.
        min_score (float): Min score value consumed by this operation.

    Returns:
        SuccessResponseDTO[SearchDataDTO]: Result produced by the operation described above.
    """
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
    """Queue a vector-index rebuild.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        request (Request): Incoming FastAPI request, including its headers and body.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[JobQueuedDTO]: Result produced by the operation described above.
    """
    result = await service.queue_reindex()
    request.app.state.worker.wake()
    return success(result)


@router.get("/jobs/{job_id}", response_model=SuccessResponseDTO[JobDTO])
async def job(
    job_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobDTO]:
    """Return one background job.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        job_id (str): Stable identifier of the job targeted by the operation.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[JobDTO]: Result produced by the operation described above.
    """
    return success(await service.job(job_id))


@router.get(
    "/backups",
    response_model=SuccessResponseDTO[BackupListDataDTO],
)
async def backups(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[BackupListDataDTO]:
    """List backup snapshots.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[BackupListDataDTO]: Result produced by the operation described above.
    """
    return success(BackupListDataDTO(backups=await service.backups()))


@router.post(
    "/backups/{backup_id}/restore",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def restore_backup(
    backup_id: str, request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue restoration of a backup snapshot.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        backup_id (str): Stable identifier of the backup targeted by the operation.
        request (Request): Incoming FastAPI request, including its headers and body.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[JobQueuedDTO]: Result produced by the operation described above.
    """
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
    """Return preview state for a tab.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[PreviewDTO]: Result produced by the operation described above.
    """
    return success(await service.preview(tab_id))


@router.post(
    "/tabs/{tab_id}/preview/refresh",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def refresh_preview(
    tab_id: str, request: Request, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue fresh preview capture for a tab.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        request (Request): Incoming FastAPI request, including its headers and body.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[JobQueuedDTO]: Result produced by the operation described above.
    """
    result = await service.queue_preview(tab_id)
    request.app.state.worker.wake()
    return success(result)


@router.get("/assets/{asset_id}", response_class=FileResponse)
async def asset(
    asset_id: str, service: Annotated[SystemService, Depends(get_system_service)]
) -> FileResponse:
    """Return a captured asset or bundled fallback.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        asset_id (str): Stable identifier of the asset targeted by the operation.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        FileResponse: Result produced by the operation described above.
    """
    result = await service.asset(asset_id)
    return FileResponse(result.path, media_type=result.media_type)


@router.get("/export")
async def export_data(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
    format: TransferFormat,
    scope: str = "all",
    fields: ExportFields = "full",
) -> Response:
    """Export the library as portable JSON or Markdown.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Transfer value
            consumed by this operation.
        format (TransferFormat): Requested interchange representation.
        scope (str): Scope value consumed by this operation.
        fields (ExportFields): Requested response projection controlling which fields are
            serialized.

    Returns:
        Response: Result produced by the operation described above.
    """
    result = await transfer.export(format, scope, fields)
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


@router.get("/sync")
async def sync_document(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> JSONResponse:
    """Return the complete schema-v2 document for trusted browser synchronization.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Transfer value
            consumed by this operation.

    Returns:
        JSONResponse: Result produced by the operation described above.
    """
    return JSONResponse(json_data(await transfer.document()))


async def _import_body(request: Request) -> tuple[object, TransferFormat]:
    """Read JSON or Markdown import content from a request.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        request (Request): Incoming FastAPI request, including its headers and body.

    Returns:
        tuple[object, TransferFormat]: Result produced by the operation described above.
    """
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
    """Validate and apply an imported library document.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        request (Request): Incoming FastAPI request, including its headers and body.
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Transfer value
            consumed by this operation.
        mode (ImportMode | None): Requested import or update behavior.
        scope (str): Scope value consumed by this operation.

    Returns:
        Response: Result produced by the operation described above.
    """
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
    """Validate an import without applying it.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        request (Request): Incoming FastAPI request, including its headers and body.
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Transfer value
            consumed by this operation.

    Returns:
        Response: Result produced by the operation described above.
    """
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
    """Return vector-index status and health scheduling state.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[IndexStatusDTO]: Result produced by the operation described above.
    """
    return success(await service.index_status())


@router.get(
    "/index/health-check",
    response_model=SuccessResponseDTO[HealthScheduleDTO],
)
async def health_schedule(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Return vector-index health scheduling state.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[HealthScheduleDTO]: Result produced by the operation described above.
    """
    return success((await service.index_status()).health_check)


@router.put(
    "/index/health-check",
    response_model=SuccessResponseDTO[HealthScheduleDTO],
)
async def configure_health(
    body: HealthConfigDTO, service: Annotated[SystemService, Depends(get_system_service)]
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Configure vector-index health scheduling.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        body (HealthConfigDTO): Validated request body supplied by the caller.
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[HealthScheduleDTO]: Result produced by the operation described above.
    """
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
    """Run a vector-index health check immediately.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[HealthScheduleDTO]: Result produced by the operation described above.
    """
    return success(await service.run_health())


@router.get("/schema")
async def schema(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    """Return the portable-document JSON schema.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        dict: Result produced by the operation described above.
    """
    return service.schema()


@router.get("/errors")
async def errors(service: Annotated[SystemService, Depends(get_system_service)]) -> dict:
    """Return the stable API error catalog.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        dict: Result produced by the operation described above.
    """
    return service.errors()


@router.delete("/library", response_model=SuccessResponseDTO[LibraryClearDTO])
async def clear_library(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[LibraryClearDTO]:
    """Back up and clear the local library.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[LibraryClearDTO]: Result produced by the operation described above.
    """
    return success(await service.clear_library())
