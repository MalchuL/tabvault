"""Durable job and backup routes."""

from typing import Annotated

from fastapi import APIRouter, Depends

from api.routes.service_dependencies import get_job_service
from lib.responses import SuccessResponseDTO, success

from .dto import JobDTO
from .service import JobService

router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=SuccessResponseDTO[JobDTO])
async def job(
    job_id: str,
    service: Annotated[JobService, Depends(get_job_service)],
) -> SuccessResponseDTO[JobDTO]:
    """Return one durable job.

    Args:
        job_id (str): Identifier of the background job.
        service (Annotated[JobService, Depends(get_job_service)]): Request-scoped service for
            this use case.

    Returns:
        SuccessResponseDTO[JobDTO]: Response envelope containing the job.
    """
    return success(await service.get(job_id))
