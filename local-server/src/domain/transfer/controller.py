"""Import, export, and browser synchronization routes."""

import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

from api.routes.service_dependencies import get_transfer_service
from domain.jobs.dto import JobQueuedDTO
from lib.responses import SuccessResponseDTO, failure, issue, json_data, success

from .dto import (
    BackupListDataDTO,
    ExportFields,
    ImportEnvelopeDTO,
    ImportMode,
    LibraryClearDTO,
    TransferFormat,
)
from .service import TransferService

router = APIRouter(tags=["transfer"])


@router.get("/backups", response_model=SuccessResponseDTO[BackupListDataDTO])
async def backups(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> SuccessResponseDTO[BackupListDataDTO]:
    """List backup snapshots."""
    return success(BackupListDataDTO(backups=await transfer.backups()))


@router.post(
    "/backups/{backup_id}/restore",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def restore_backup(
    backup_id: str,
    request: Request,
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue restoration of a backup snapshot."""
    result = await transfer.queue_restore(backup_id)
    request.app.state.worker.wake()
    return success(result)


@router.delete("/library", response_model=SuccessResponseDTO[LibraryClearDTO])
async def clear_library(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> SuccessResponseDTO[LibraryClearDTO]:
    """Back up and clear all library records atomically."""
    return success(await transfer.clear_library())


@router.get("/export")
async def export_data(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
    format: TransferFormat,
    scope: str = "all",
    fields: ExportFields = "full",
) -> Response:
    """Export the library as portable JSON or Markdown."""
    result = await transfer.export(format, scope, fields)
    suffix = format if format == "json" else "md"
    headers = {
        "Content-Disposition": f'attachment; filename="tabvault-export-{datetime.now(UTC).date()}.{suffix}"'
    }
    if format == "json":
        content = (
            json_data(result.content) if isinstance(result.content, BaseModel) else result.content
        )
        return JSONResponse(content, headers=headers)
    return PlainTextResponse(str(result.content), media_type=result.media_type, headers=headers)


@router.get("/sync")
async def sync_document(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> JSONResponse:
    """Return the complete schema-v3 synchronization document."""
    return JSONResponse(json_data(await transfer.document()))


async def _import_body(request: Request) -> tuple[object, TransferFormat]:
    content_type = request.headers.get("content-type", "").split(";", 1)[0]
    raw = await request.body()
    if content_type == "text/markdown":
        return raw.decode(), "markdown"
    if content_type == "application/json":
        value = json.loads(raw or b"{}")
        if isinstance(value, dict) and {"mode", "format", "content"}.issubset(value):
            return value["content"], value["format"]
        return value, "json"
    return raw.decode(), "markdown"


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
    request: Request,
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> Response:
    """Validate an import without applying it."""
    content, format = await _import_body(request)
    result = await transfer.validate(content, format)
    body = success(result) if result.valid else failure(result.errors, result.warnings)
    return JSONResponse(json_data(body), status_code=200 if result.valid else 422)
