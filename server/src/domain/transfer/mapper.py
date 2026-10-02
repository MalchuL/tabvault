"""Mappings for portable transfer records and backups."""

from pathlib import Path

from lib.time import stored_utc, utc_now
from models import (
    Backup,
    Group,
    GroupDetails,
    GroupPlacement,
    GroupTimestamps,
    Tab,
    TabAnnotations,
    TabContent,
    TabLifecycle,
    TabPlacement,
    TabTimestamps,
    Tag,
)

from .dto import BackupDTO, TransferGroupDTO, TransferTabDTO, TransferTagDTO


class TransferMapper:
    """Convert transfer DTOs, ORM rows, and backup metadata."""

    @staticmethod
    def tag_to_dto(tag: Tag) -> TransferTagDTO:
        """Convert a tag row to portable data.

        Args:
            tag (Tag): Tag row being converted or persisted.

        Returns:
            TransferTagDTO: Portable tag name and description.
        """
        return TransferTagDTO(
            name=tag.name,
            description=tag.description,
            created_at=stored_utc(tag.created_at) or tag.created_at,
            updated_at=stored_utc(tag.updated_at) or tag.updated_at,
        )

    @staticmethod
    def group_to_dto(group: Group) -> TransferGroupDTO:
        """Convert a group row to portable data.

        Args:
            group (Group): Group row being converted or persisted.

        Returns:
            TransferGroupDTO: Portable group metadata and category.
        """
        return TransferGroupDTO.model_validate(
            {
                "id": group.id,
                "details": {
                    "name": group.details.name,
                    "category": group.details.category,
                    "description": group.details.description,
                    "color": group.details.color,
                },
                "placement": {"position": group.placement.position},
                "timestamps": {
                    "created_at": stored_utc(group.timestamps.created_at)
                    or group.timestamps.created_at,
                    "updated_at": stored_utc(group.timestamps.updated_at)
                    or group.timestamps.updated_at,
                },
            }
        )

    @staticmethod
    def tab_to_dto(tab: Tab) -> TransferTabDTO:
        """Convert a tab row to portable data.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.

        Returns:
            TransferTabDTO: Portable saved-tab fields and associations.
        """
        return TransferTabDTO.model_validate(
            {
                "id": tab.id,
                "content": {
                    "url": tab.content.url,
                    "title": tab.content.title,
                },
                "annotations": {
                    "custom_properties": dict(tab.annotations.custom_properties or {}),
                    "tags": [tag.name for tag in tab.tags],
                },
                "placement": {
                    "group_id": tab.placement.group_id,
                    "position": tab.placement.position,
                },
                "lifecycle": {
                    "archived": tab.lifecycle.archived,
                    "archived_at": stored_utc(tab.lifecycle.archived_at),
                    "hidden_until": stored_utc(tab.lifecycle.hidden_until),
                },
                "timestamps": {
                    "created_at": stored_utc(tab.timestamps.created_at)
                    or tab.timestamps.created_at,
                    "updated_at": stored_utc(tab.timestamps.updated_at)
                    or tab.timestamps.updated_at,
                },
            }
        )

    @staticmethod
    def tag_from_dto(dto: TransferTagDTO) -> Tag:
        """Create a tag row from portable data.

        Args:
            dto (TransferTagDTO): Validated request data for the operation.

        Returns:
            Tag: Tag row read or staged by this operation.
        """
        return Tag(
            name=dto.name,
            description=dto.description,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
        )

    @staticmethod
    def group_from_dto(dto: TransferGroupDTO) -> Group:
        """Create a group row from portable data.

        Args:
            dto (TransferGroupDTO): Validated request data for the operation.

        Returns:
            Group: Group row read or staged by this operation.
        """
        return Group(
            id=dto.id,
            details=GroupDetails(
                name=dto.details.name,
                category=dto.details.category,
                description=dto.details.description or "",
                color=dto.details.color,
            ),
            placement=GroupPlacement(position=dto.placement.position),
            timestamps=GroupTimestamps(
                created_at=dto.timestamps.created_at or utc_now(),
                updated_at=dto.timestamps.updated_at or utc_now(),
            ),
        )

    @staticmethod
    def tag_changes(dto: TransferTagDTO) -> dict[str, object]:
        """Map portable tag changes to ORM fields.

        Args:
            dto (TransferTagDTO): Validated request data for the operation.

        Returns:
            dict[str, object]: Serialized fields keyed for the caller.
        """
        return {"description": dto.description, "updated_at": dto.updated_at}

    @staticmethod
    def group_changes(dto: TransferGroupDTO) -> dict[str, object]:
        """Map portable group changes to ORM fields.

        Args:
            dto (TransferGroupDTO): Validated request data for the operation.

        Returns:
            dict[str, object]: Serialized fields keyed for the caller.
        """
        return {
            "name": dto.details.name,
            "category": dto.details.category,
            "description": dto.details.description or "",
            "color": dto.details.color,
            "position": dto.placement.position,
            "updated_at": dto.timestamps.updated_at,
        }

    @staticmethod
    def tab_from_dto(dto: TransferTabDTO, tags: list[Tag]) -> Tab:
        """Create a tab row from portable data.

        Args:
            dto (TransferTabDTO): Validated request data for the operation.
            tags (list[Tag]): Tag filters or associations for the operation.

        Returns:
            Tab: Tab row read or staged by this operation.
        """
        return Tab(
            id=dto.id,
            tags=tags,
            content=TabContent(url=dto.content.url, title=dto.content.title),
            annotations=TabAnnotations(
                custom_properties=dict(dto.annotations.custom_properties),
            ),
            placement=TabPlacement(
                group_id=None if dto.lifecycle.archived else dto.placement.group_id,
                position=dto.placement.position,
            ),
            lifecycle=TabLifecycle(
                archived=dto.lifecycle.archived,
                archived_at=dto.lifecycle.archived_at,
                hidden_until=dto.lifecycle.hidden_until,
            ),
            timestamps=TabTimestamps(
                created_at=dto.timestamps.created_at or utc_now(),
                updated_at=dto.timestamps.updated_at or utc_now(),
            ),
        )

    @staticmethod
    def tab_changes(dto: TransferTabDTO, tags: list[Tag]) -> dict[str, object]:
        """Map portable tab changes to ORM fields.

        Args:
            dto (TransferTabDTO): Validated request data for the operation.
            tags (list[Tag]): Tag filters or associations for the operation.

        Returns:
            dict[str, object]: Serialized fields keyed for the caller.
        """
        return {
            "url": dto.content.url,
            "title": dto.content.title,
            "custom_properties": dict(dto.annotations.custom_properties),
            "group_id": None if dto.lifecycle.archived else dto.placement.group_id,
            "position": dto.placement.position,
            "archived": dto.lifecycle.archived,
            "archived_at": dto.lifecycle.archived_at,
            "hidden_until": dto.lifecycle.hidden_until,
            "tags": tags,
            "updated_at": dto.timestamps.updated_at,
        }

    @staticmethod
    def backup(backup_id: str, path: Path, reason: str, size_bytes: int) -> Backup:
        """Create a backup row from generated file metadata.

        Args:
            backup_id (str): Identifier of the backup to restore.
            path (Path): Filesystem path to the captured or exported file.
            reason (str): Reason recorded for the backup.
            size_bytes (int): Size of the captured file in bytes.

        Returns:
            Backup: Unsaved backup row initialized from the generated file metadata.
        """
        return Backup(id=backup_id, path=str(path), reason=reason, size_bytes=size_bytes)

    @staticmethod
    def backup_to_dto(backup: Backup) -> BackupDTO:
        """Convert backup metadata to its wire DTO.

        Args:
            backup (Backup): Persisted backup row being converted to an API response.

        Returns:
            BackupDTO: Metadata for the newly created backup.
        """
        return BackupDTO(
            id=backup.id,
            created_at=backup.created_at,
            reason=backup.reason,
            size_bytes=backup.size_bytes,
        )
