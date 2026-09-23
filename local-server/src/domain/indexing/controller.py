"""Vector index operations and health scheduling routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from api.routes.service_dependencies import get_indexing_service
from domain.jobs.dto import JobQueuedDTO
from lib.responses import SuccessResponseDTO, success

from .dto import HealthConfigDTO, HealthScheduleDTO, IndexStatusDTO
from .service import IndexingService

router = APIRouter(tags=["indexing"])


@router.post("/search/reindex", status_code=202, response_model=SuccessResponseDTO[JobQueuedDTO])
async def reindex(
    request: Request,
    service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> SuccessResponseDTO[JobQueuedDTO]:
    """Queue a vector-index rebuild."""
    result = await service.queue_reindex()
    request.app.state.worker.wake()
    return success(result)


@router.get("/index/status", response_model=SuccessResponseDTO[IndexStatusDTO])
async def index_status(
    service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> SuccessResponseDTO[IndexStatusDTO]:
    """Return vector-index status."""
    return success(await service.index_status())


@router.get("/index/health-check", response_model=SuccessResponseDTO[HealthScheduleDTO])
async def health_schedule(
    service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Return vector-index health scheduling state."""
    return success(await service.health_schedule())


@router.put("/index/health-check", response_model=SuccessResponseDTO[HealthScheduleDTO])
async def configure_health(
    body: HealthConfigDTO,
    service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Configure vector-index health scheduling."""
    return success(
        await service.configure_health(body.interval_seconds, body.notify_on_needs_attention)
    )


@router.post("/index/health-check/run", response_model=SuccessResponseDTO[HealthScheduleDTO])
async def run_health(
    service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> SuccessResponseDTO[HealthScheduleDTO]:
    """Run a vector-index health check now."""
    return success(await service.run_health())
