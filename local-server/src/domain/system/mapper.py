"""Map system DTOs and persistence models."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from lib.time import utc_now
from models import Asset, Backup, Group, HealthSchedule, IdempotencyRecord, Job, Preview, Tab, Tag

from .dto import (
    AssetFileDTO,
    BackupDTO,
    HealthScheduleDTO,
    JobDTO,
    PreviewDTO,
    TransferGroupDTO,
    TransferTabDTO,
    TransferTagDTO,
    VectorStatusDTO,
)


class SystemMapper:
    """Convert system ORM rows and stable values to DTOs."""

    @staticmethod
    def vector_status(value: dict[str, object]) -> VectorStatusDTO:
        """Validate vector-index status data."""
        return VectorStatusDTO.model_validate(value)

    @staticmethod
    def job_to_dto(job: Job) -> JobDTO:
        """Convert a job row to a response DTO."""
        return JobDTO(
            id=job.id,
            status=job.status,
            progress=job.progress,
            result=job.result,
            error=job.error,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    @staticmethod
    def backup_to_dto(backup: Backup) -> BackupDTO:
        """Convert a backup row to a response DTO."""
        return BackupDTO(
            id=backup.id,
            created_at=backup.created_at,
            reason=backup.reason,
            size_bytes=backup.size_bytes,
        )

    @staticmethod
    def preview_to_dto(tab_id: str, preview: Preview | None) -> PreviewDTO:
        """Convert optional preview state to a response DTO."""
        if preview is None:
            return PreviewDTO(
                tab_id=tab_id,
                status="pending",
                fallback_asset="/api/v1/assets/fallback-preview",
            )
        return PreviewDTO(
            tab_id=tab_id,
            status=preview.status,
            title=preview.title,
            byline=preview.byline,
            site_name=preview.site_name,
            excerpt=preview.excerpt,
            content_html=preview.content_html,
            length=preview.length,
            source_url=preview.source_url,
            error=preview.error,
            fetched_at=preview.fetched_at,
            fallback_asset="/api/v1/assets/fallback-preview",
        )

    @staticmethod
    def schedule_to_dto(schedule: HealthSchedule) -> HealthScheduleDTO:
        """Convert a health schedule row to a response DTO."""
        return HealthScheduleDTO(
            enabled=schedule.interval_seconds > 0,
            interval_seconds=schedule.interval_seconds,
            notify_on_needs_attention=schedule.notify_on_needs_attention,
            last_check=schedule.last_check,
            last_result=schedule.last_result,
            last_alert=schedule.last_alert,
        )

    @staticmethod
    def asset_file(path: Path, media_type: str) -> AssetFileDTO:
        """Create a typed asset-file result."""
        return AssetFileDTO(path=path, media_type=media_type)

    @staticmethod
    def tag_to_transfer(tag: Tag) -> TransferTagDTO:
        """Convert a tag row to a portable-document DTO."""
        return TransferTagDTO(
            name=tag.name,
            description=tag.description,
            created_at=tag.created_at,
            updated_at=tag.updated_at,
        )

    @staticmethod
    def group_to_transfer(group: Group) -> TransferGroupDTO:
        """Convert a group row to a portable-document DTO."""
        return TransferGroupDTO(
            id=group.id,
            name=group.name,
            description=group.description,
            parent_id=group.parent_id,
            color=group.color,
            position=group.position,
            archived=group.archived,
            archived_at=group.archived_at,
            created_at=group.created_at,
            updated_at=group.updated_at,
        )

    @staticmethod
    def tab_to_transfer(tab: Tab) -> TransferTabDTO:
        """Convert a tab row to a portable-document DTO."""
        return TransferTabDTO(
            id=tab.id,
            url=tab.url,
            title=tab.title,
            favicon=f"/api/v1/assets/{tab.favicon_asset_id}" if tab.favicon_asset_id else None,
            note=tab.note,
            agent_review=tab.agent_review,
            viewed=tab.viewed,
            tags=[tag.name for tag in tab.tags],
            group_id=tab.group_id,
            position=tab.position,
            archived=tab.archived,
            archived_at=tab.archived_at,
            created_at=tab.created_at,
            updated_at=tab.updated_at,
        )

    @staticmethod
    def tag_from_transfer(dto: TransferTagDTO) -> Tag:
        """Create a tag model from portable data."""
        return Tag(
            name=dto.name,
            description=dto.description,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
        )

    @staticmethod
    def group_from_transfer(dto: TransferGroupDTO) -> Group:
        """Create a group model from portable data."""
        return Group(
            id=dto.id,
            name=dto.name,
            description=dto.description or "",
            parent_id=dto.parent_id,
            color=dto.color,
            position=dto.position,
            archived=dto.archived,
            archived_at=dto.archived_at,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
        )

    @staticmethod
    def tag_transfer_changes(dto: TransferTagDTO) -> dict[str, object]:
        """Map newer portable tag data to ORM fields."""
        return {"description": dto.description, "updated_at": dto.updated_at}

    @staticmethod
    def group_transfer_changes(dto: TransferGroupDTO) -> dict[str, object]:
        """Map newer portable group data to ORM fields."""
        return {
            "name": dto.name,
            "description": dto.description or "",
            "parent_id": dto.parent_id,
            "color": dto.color,
            "position": dto.position,
            "archived": dto.archived,
            "archived_at": dto.archived_at,
            "updated_at": dto.updated_at,
        }

    @staticmethod
    def tab_from_transfer(dto: TransferTabDTO, normalized_url: str, tags: list[Tag]) -> Tab:
        """Create a tab model from portable data."""
        return Tab(
            id=dto.id,
            url=normalized_url,
            normalized_url=normalized_url,
            title=dto.title,
            note=dto.note or "",
            agent_review=dto.agent_review or "",
            viewed=dto.viewed,
            group_id=dto.group_id,
            position=dto.position,
            archived=dto.archived,
            archived_at=dto.archived_at,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
            tags=tags,
        )

    @staticmethod
    def tab_transfer_changes(dto: TransferTabDTO, tags: list[Tag]) -> dict[str, object]:
        """Map newer portable tab data to ORM fields."""
        return {
            "title": dto.title,
            "note": dto.note or "",
            "agent_review": dto.agent_review or "",
            "viewed": dto.viewed,
            "group_id": dto.group_id,
            "position": dto.position,
            "archived": dto.archived,
            "archived_at": dto.archived_at,
            "tags": tags,
            "updated_at": dto.updated_at,
        }

    @staticmethod
    def tab_duplicate_changes(dto: TransferTabDTO, tags: list[Tag]) -> dict[str, object]:
        """Map portable data merged into a normalized-URL duplicate."""
        changes: dict[str, object] = {
            "tags": tags,
            "updated_at": utc_now(),
            "archived": False,
            "archived_at": None,
        }
        if dto.title:
            changes["title"] = dto.title
        if dto.note:
            changes["note"] = dto.note
        if dto.agent_review:
            changes["agent_review"] = dto.agent_review
        if dto.viewed:
            changes["viewed"] = True
        return changes

    @staticmethod
    def backup(backup_id: str, path: Path, reason: str, size_bytes: int) -> Backup:
        """Create a backup model from generated file metadata."""
        return Backup(id=backup_id, path=str(path), reason=reason, size_bytes=size_bytes)

    @staticmethod
    def job(kind: str, target_id: str | None = None, result: dict[str, Any] | None = None) -> Job:
        """Create a job model from stable scheduling values."""
        return Job(kind=kind, target_id=target_id, result=result)

    @staticmethod
    def asset(
        *,
        kind: str,
        path: Path,
        content_type: str,
        size_bytes: int,
        checksum: str,
        source_url: str,
    ) -> Asset:
        """Create an asset model from captured file metadata."""
        return Asset(
            kind=kind,
            path=str(path),
            content_type=content_type,
            size_bytes=size_bytes,
            checksum=checksum,
            source_url=source_url,
        )

    @staticmethod
    def preview(tab_id: str) -> Preview:
        """Create pending preview state for a tab."""
        return Preview(tab_id=tab_id)

    @staticmethod
    def idempotency(
        *,
        key: str,
        request_hash: str,
        status_code: int,
        response: dict[str, Any],
        expires_at: datetime,
    ) -> IdempotencyRecord:
        """Create an idempotency model from captured response metadata."""
        return IdempotencyRecord(
            key=key,
            request_hash=request_hash,
            status_code=status_code,
            response=response,
            expires_at=expires_at,
        )
