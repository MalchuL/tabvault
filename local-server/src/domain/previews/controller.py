"""Captured preview and asset routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse

from api.routes.service_dependencies import get_preview_service
from domain.jobs.dto import JobQueuedDTO
from lib.responses import SuccessResponseDTO, success

from .dto import PreviewDTO
from .query_service import PreviewQueryService

router = APIRouter(tags=["previews"])


@router.get("/tabs/{tab_id}/preview", response_model=SuccessResponseDTO[PreviewDTO])
async def preview(
    tab_id: str,
    service: Annotated[PreviewQueryService, Depends(get_preview_service)],
) -> SuccessResponseDTO[PreviewDTO]:
    """Return preview state for a tab."""
    return success(await service.preview(tab_id))


@router.post(
    "/tabs/{tab_id}/preview/refresh",
    status_code=202,
    response_model=SuccessResponseDTO[JobQueuedDTO],
)
async def refresh_preview(
    tab_id: str,
    request: Request,
    service: Annotated[PreviewQueryService, Depends(get_preview_service)],
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue fresh preview capture for a tab."""
    result = await service.queue(tab_id)
    request.app.state.worker.wake()
    return success(result)


@router.get("/assets/{asset_id}", response_class=FileResponse)
async def asset(
    asset_id: str,
    service: Annotated[PreviewQueryService, Depends(get_preview_service)],
) -> FileResponse:
    """Return a captured asset or bundled fallback."""
    result = await service.asset(asset_id)
    return FileResponse(result.path, media_type=result.media_type)
