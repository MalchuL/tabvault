"""Map tab DTOs and persistence models."""

from __future__ import annotations

from typing import Any

from lib.time import utc_now
from models import Tab, Tag

from .dto import (
    TabCreatedDTO,
    TabCreateDTO,
    TabDTO,
    TabMoveDTO,
    TabProjectionDTO,
    TabRestoreDTO,
    TabUpdateDTO,
)


class TabMapper:
    """Convert between tab DTOs and ORM models."""

    @staticmethod
    def to_dto(tab: Tab) -> TabDTO:
        """Convert a tab row to its complete response DTO.

        Args:
            tab: Loaded tab row, including tags.

        Returns:
            Complete tab response.
        """
        return TabDTO(
            id=tab.id,
            url=tab.url,
            title=tab.title,
            favicon=f"/api/v1/assets/{tab.favicon_asset_id}" if tab.favicon_asset_id else None,
            note=tab.note,
            tags=[tag.name for tag in tab.tags],
            group_id=tab.group_id,
            position=tab.position,
            archived=tab.archived,
            archived_at=tab.archived_at,
            created_at=tab.created_at,
            updated_at=tab.updated_at,
        )

    @classmethod
    def to_projection(cls, tab: Tab, fields: str) -> TabDTO | TabProjectionDTO:
        """Convert a tab row to the requested field projection.

        Args:
            tab: Loaded tab row.
            fields: ``full``, ``minimal``, or a comma-separated field whitelist.

        Returns:
            A complete or projected tab DTO.
        """
        dto = cls.to_dto(tab)
        if fields == "full":
            return dto
        allowed = (
            {"id", "url", "title", "favicon", "groupId", "tags"}
            if fields == "minimal"
            else {value.strip() for value in fields.split(",")}
        )
        values = dto.model_dump(by_alias=True)
        return TabProjectionDTO.model_validate(
            {key: value for key, value in values.items() if key in allowed}
        )

    @classmethod
    def to_created_dto(cls, tab: Tab, was_duplicate: bool) -> TabCreatedDTO:
        """Convert a tab row to a batch creation result.

        Args:
            tab: Loaded or newly created tab row.
            was_duplicate: Whether the request matched an existing tab.

        Returns:
            Created-tab result DTO.
        """
        return TabCreatedDTO(**cls.to_dto(tab).model_dump(), was_duplicate=was_duplicate)

    @staticmethod
    def from_create_dto(
        dto: TabCreateDTO,
        *,
        normalized_url: str,
        group_id: str | None,
        position: float,
        tags: list[Tag],
    ) -> Tab:
        """Create a tab model from a validated request.

        Args:
            dto: Validated tab request.
            normalized_url: Canonical URL used for deduplication.
            group_id: Normalized nullable group identifier.
            position: Resolved ordering position.
            tags: Loaded tag models.

        Returns:
            An unpersisted tab model.
        """
        values: dict[str, Any] = {
            "url": normalized_url,
            "normalized_url": normalized_url,
            "title": dto.title or normalized_url,
            "note": dto.note,
            "group_id": group_id,
            "position": position,
            "archived": dto.archived,
            "archived_at": dto.archived_at,
            "created_at": dto.created_at or utc_now(),
            "updated_at": dto.updated_at or utc_now(),
            "tags": tags,
        }
        if dto.id is not None:
            values["id"] = dto.id
        return Tab(**values)

    @staticmethod
    def to_update_dict(dto: TabUpdateDTO) -> dict[str, Any]:
        """Convert an update DTO to explicitly supplied ORM field values.

        Args:
            dto: Validated partial update.

        Returns:
            Snake-case values suitable for repository mutation.
        """
        return dto.model_dump(exclude_unset=True)

    @staticmethod
    def to_merge_dict(dto: TabCreateDTO, tags: list[Tag]) -> dict[str, Any]:
        """Map duplicate-merge fields from a create DTO.

        Args:
            dto: Incoming create request.
            tags: Resolved union of existing and incoming tags.

        Returns:
            Values to apply to the existing row.
        """
        values: dict[str, Any] = {"tags": tags, "updated_at": utc_now()}
        if dto.title:
            values["title"] = dto.title
        if dto.note:
            values["note"] = dto.note
        return values

    @staticmethod
    def to_move_dict(dto: TabMoveDTO, *, position: float) -> dict[str, Any]:
        """Map a move request to tab model fields.

        Args:
            dto: Validated move request.
            position: Calculated fractional position.

        Returns:
            Values to apply to the moved row.
        """
        group_id = None if dto.target_group_id in {None, "", "inbox"} else dto.target_group_id
        return {"group_id": group_id, "position": position, "updated_at": utc_now()}

    @staticmethod
    def to_restore_dict(dto: TabRestoreDTO, tags: list[Tag]) -> dict[str, Any]:
        """Map synchronized restore data to an existing tab.

        Args:
            dto: Incoming restore data.
            tags: Resolved tag rows.

        Returns:
            Values to apply to the restored row.
        """
        return {
            "title": dto.title,
            "note": dto.note,
            "group_id": dto.group_id,
            "position": dto.position or 0,
            "archived": dto.archived,
            "archived_at": dto.archived_at,
            "tags": tags,
            "updated_at": dto.updated_at,
        }
