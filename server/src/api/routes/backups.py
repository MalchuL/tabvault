"""Dedicated HTTP routes for portable snapshots and manual database copies."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from api.routes.service_dependencies import get_transfer_service
from domain.transfer.dto import BackupListDataDTO, DatabaseBackupDTO, ImportApplyResultDTO
from domain.transfer.service import TransferService
from lib.responses import SuccessResponseDTO, success

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("", response_model=SuccessResponseDTO[BackupListDataDTO])
async def backups(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> SuccessResponseDTO[BackupListDataDTO]:
    """List backup snapshots.

    Args:
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Request-scoped
            transfer service for import, export, and backup operations.

    Returns:
        SuccessResponseDTO[BackupListDataDTO]: Response envelope containing the backup list
            data.
    """
    return success(BackupListDataDTO(backups=await transfer.backups()))


@router.post("/database", response_model=SuccessResponseDTO[DatabaseBackupDTO], status_code=201)
async def create_database_backup(
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> SuccessResponseDTO[DatabaseBackupDTO]:
    """Create a database copy with the same authentication as other API operations.

    Args:
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Request-scoped
            service enforcing backup configuration and creating the database copy.

    Returns:
        SuccessResponseDTO[DatabaseBackupDTO]: HTTP 201 envelope with the absolute server path.

    Raises:
        DatabaseBackupDisabledError: Server configuration disables this operation (HTTP 403).
        DatabaseBackupUnsupportedError: The database is not file-backed SQLite (HTTP 503).
    """
    return success(await transfer.create_database_backup())


@router.get("/{backup_id}/download")
async def download_backup(
    backup_id: str,
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> FileResponse:
    """Download a registered JSON backup with normal API authentication.

    Args:
        backup_id (str): Existing snapshot identifier.
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Transfer service.

    Returns:
        FileResponse: Unmodified portable JSON snapshot.
    """
    path = await transfer.backup_path(backup_id)
    return FileResponse(
        path, media_type="application/json", filename=f"tabvault-backup-{backup_id}.json"
    )


@router.post(
    "/{backup_id}/restore",
    response_model=ImportApplyResultDTO,
)
async def restore_backup(
    backup_id: str,
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> ImportApplyResultDTO:
    """Complete backup restoration in one request transaction.

    Args:
        backup_id (str): Identifier of the backup to restore.
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Request-scoped
            transfer service for import, export, and backup operations.

    Returns:
        ImportApplyResultDTO: Completed restore result.
    """
    return await transfer.restore_backup(backup_id)
