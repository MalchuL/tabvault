"""Map system DTOs and persistence models."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from lib.time import stored_utc, utc_now
from models import Asset, Backup, Group, HealthSchedule, Job, Preview, Tab, Tag

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
    """Convert system ORM rows and stable values to DTOs.

    Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
    boundary and centralizes differences between database field names, public DTOs, and portable
    transfer records.
    """

    @staticmethod
    def vector_status(value: dict[str, object]) -> VectorStatusDTO:
        """Validate vector-index status data.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            value (dict[str, object]): Value to validate, convert, or persist.

        Returns:
            VectorStatusDTO: Result produced by the operation described above.
        """
        return VectorStatusDTO.model_validate(value)

    @staticmethod
    def job_to_dto(job: Job) -> JobDTO:
        """Convert a job row to a response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            job (Job): Job value consumed by this operation.

        Returns:
            JobDTO: Result produced by the operation described above.
        """
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
        """Convert a backup row to a response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            backup (Backup): Backup value consumed by this operation.

        Returns:
            BackupDTO: Result produced by the operation described above.
        """
        return BackupDTO(
            id=backup.id,
            created_at=backup.created_at,
            reason=backup.reason,
            size_bytes=backup.size_bytes,
        )

    @staticmethod
    def preview_to_dto(tab_id: str, preview: Preview | None) -> PreviewDTO:
        """Convert optional preview state to a response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.
            preview (Preview | None): Preview value consumed by this operation.

        Returns:
            PreviewDTO: Result produced by the operation described above.
        """
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
        """Convert a health schedule row to a response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            schedule (HealthSchedule): Schedule value consumed by this operation.

        Returns:
            HealthScheduleDTO: Result produced by the operation described above.
        """
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
        """Create a typed asset-file result.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            path (Path): Filesystem path used by the operation.
            media_type (str): Media type value consumed by this operation.

        Returns:
            AssetFileDTO: Result produced by the operation described above.
        """
        return AssetFileDTO(path=path, media_type=media_type)

    @staticmethod
    def tag_to_transfer(tag: Tag) -> TransferTagDTO:
        """Convert a tag row to a portable-document DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tag (Tag): Tag value consumed by this operation.

        Returns:
            TransferTagDTO: Result produced by the operation described above.
        """
        return TransferTagDTO(
            name=tag.name,
            description=tag.description,
            created_at=stored_utc(tag.created_at) or tag.created_at,
            updated_at=stored_utc(tag.updated_at) or tag.updated_at,
        )

    @staticmethod
    def group_to_transfer(group: Group) -> TransferGroupDTO:
        """Convert a group row to a portable-document DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            group (Group): Group value consumed by this operation.

        Returns:
            TransferGroupDTO: Result produced by the operation described above.
        """
        return TransferGroupDTO(
            id=group.id,
            name=group.name,
            category=group.category,
            description=group.description,
            color=group.color,
            position=group.position,
            created_at=stored_utc(group.created_at) or group.created_at,
            updated_at=stored_utc(group.updated_at) or group.updated_at,
        )

    @staticmethod
    def tab_to_transfer(tab: Tab) -> TransferTabDTO:
        """Convert a tab row to a portable-document DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab (Tab): Tab value consumed by this operation.

        Returns:
            TransferTabDTO: Result produced by the operation described above.
        """
        return TransferTabDTO(
            id=tab.id,
            url=tab.url,
            title=tab.title,
            favicon=f"/api/v1/assets/{tab.favicon_asset_id}" if tab.favicon_asset_id else None,
            note=tab.note,
            agent_review=tab.agent_review,
            custom_properties=dict(tab.custom_properties or {}),
            tags=[tag.name for tag in tab.tags],
            group_id=tab.group_id,
            position=tab.position,
            archived=tab.archived,
            archived_at=stored_utc(tab.archived_at),
            hidden_until=stored_utc(tab.hidden_until),
            created_at=stored_utc(tab.created_at) or tab.created_at,
            updated_at=stored_utc(tab.updated_at) or tab.updated_at,
        )

    @staticmethod
    def tag_from_transfer(dto: TransferTagDTO) -> Tag:
        """Create a tag model from portable data.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TransferTagDTO): Validated data-transfer object supplied to the operation.

        Returns:
            Tag: Result produced by the operation described above.
        """
        return Tag(
            name=dto.name,
            description=dto.description,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
        )

    @staticmethod
    def group_from_transfer(dto: TransferGroupDTO) -> Group:
        """Create a group model from portable data.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TransferGroupDTO): Validated data-transfer object supplied to the operation.

        Returns:
            Group: Result produced by the operation described above.
        """
        return Group(
            id=dto.id,
            name=dto.name,
            category=dto.category,
            description=dto.description or "",
            color=dto.color,
            position=dto.position,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
        )

    @staticmethod
    def tag_transfer_changes(dto: TransferTagDTO) -> dict[str, object]:
        """Map newer portable tag data to ORM fields.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TransferTagDTO): Validated data-transfer object supplied to the operation.

        Returns:
            dict[str, object]: Result produced by the operation described above.
        """
        return {"description": dto.description, "updated_at": dto.updated_at}

    @staticmethod
    def group_transfer_changes(dto: TransferGroupDTO) -> dict[str, object]:
        """Map newer portable group data to ORM fields.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TransferGroupDTO): Validated data-transfer object supplied to the operation.

        Returns:
            dict[str, object]: Result produced by the operation described above.
        """
        return {
            "name": dto.name,
            "category": dto.category,
            "description": dto.description or "",
            "color": dto.color,
            "position": dto.position,
            "updated_at": dto.updated_at,
        }

    @staticmethod
    def tab_from_transfer(dto: TransferTabDTO, tags: list[Tag]) -> Tab:
        """Create a tab model from portable data.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TransferTabDTO): Validated data-transfer object supplied to the operation.
            tags (list[Tag]): Tags value consumed by this operation.

        Returns:
            Tab: Result produced by the operation described above.
        """
        return Tab(
            id=dto.id,
            url=dto.url,
            title=dto.title,
            note=dto.note or "",
            agent_review=dto.agent_review or "",
            custom_properties=dict(dto.custom_properties),
            group_id=None if dto.archived else dto.group_id,
            position=dto.position,
            archived=dto.archived,
            archived_at=dto.archived_at,
            hidden_until=dto.hidden_until,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
            tags=tags,
        )

    @staticmethod
    def tab_transfer_changes(dto: TransferTabDTO, tags: list[Tag]) -> dict[str, object]:
        """Map newer portable tab data to ORM fields.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TransferTabDTO): Validated data-transfer object supplied to the operation.
            tags (list[Tag]): Tags value consumed by this operation.

        Returns:
            dict[str, object]: Result produced by the operation described above.
        """
        return {
            "url": dto.url,
            "title": dto.title,
            "note": dto.note or "",
            "agent_review": dto.agent_review or "",
            "custom_properties": dict(dto.custom_properties),
            "group_id": None if dto.archived else dto.group_id,
            "position": dto.position,
            "archived": dto.archived,
            "archived_at": dto.archived_at,
            "hidden_until": dto.hidden_until,
            "tags": tags,
            "updated_at": dto.updated_at,
        }

    @staticmethod
    def backup(backup_id: str, path: Path, reason: str, size_bytes: int) -> Backup:
        """Create a backup model from generated file metadata.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            backup_id (str): Stable identifier of the backup targeted by the operation.
            path (Path): Filesystem path used by the operation.
            reason (str): Stable reason recorded for the operation.
            size_bytes (int): Size bytes value consumed by this operation.

        Returns:
            Backup: Result produced by the operation described above.
        """
        return Backup(id=backup_id, path=str(path), reason=reason, size_bytes=size_bytes)

    @staticmethod
    def job(kind: str, target_id: str | None = None, result: dict[str, Any] | None = None) -> Job:
        """Create a job model from stable scheduling values.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            kind (str): Kind value consumed by this operation.
            target_id (str | None): Stable identifier of the target targeted by the operation.
            result (dict[str, Any] | None): Result value consumed by this operation.

        Returns:
            Job: Result produced by the operation described above.
        """
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
        """Create an asset model from captured file metadata.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            kind (str): Kind value consumed by this operation.
            path (Path): Filesystem path used by the operation.
            content_type (str): Content type value consumed by this operation.
            size_bytes (int): Size bytes value consumed by this operation.
            checksum (str): Checksum value consumed by this operation.
            source_url (str): Source url value consumed by this operation.

        Returns:
            Asset: Result produced by the operation described above.
        """
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
        """Create pending preview state for a tab.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            Preview: Result produced by the operation described above.
        """
        return Preview(tab_id=tab_id)
