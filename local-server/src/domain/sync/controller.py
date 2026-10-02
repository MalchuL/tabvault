"""Authenticated transactional synchronization HTTP boundary."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from api.routes.service_dependencies import SessionDep, SettingsDep

from .dto import SyncRequestDTO, SyncResponseDTO
from .service import SyncConflictError, SyncService

router = APIRouter(tags=["sync"])


def sync_service(db: SessionDep, settings: SettingsDep) -> SyncService:
    """Construct a request-scoped sync service.

    Args:
        db (SessionDep): Caller-owned database transaction.
        settings (SettingsDep): Validated server configuration.

    Returns:
        SyncService: Service using the request session.
    """
    return SyncService(db, settings)


@router.post("/sync", response_model=SyncResponseDTO)
async def synchronize(
    body: SyncRequestDTO, service: Annotated[SyncService, Depends(sync_service)]
) -> SyncResponseDTO:
    """Apply pending changes and return the committed library.

    Args:
        body (SyncRequestDTO): Versioned changes and prior generation.
        service (SyncService): Request-scoped transaction owner.

    Returns:
        SyncResponseDTO: Snapshot and exact acknowledged tokens.

    Raises:
        HTTPException: Generation mismatch or invalid resource changes.
    """
    try:
        return await service.apply(body)
    except SyncConflictError as error:
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
