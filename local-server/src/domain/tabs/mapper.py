"""Map Saved Tab DTOs and persistence models."""

from __future__ import annotations

from typing import Any

from lib.time import stored_utc
from models import Tab, Tag

from .dto import TabCreateDTO, TabDTO, TabProjectionDTO, TabUpdateDTO


class TabMapper:
    """Convert between Saved Tab DTOs and ORM models.

    Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
    boundary and centralizes differences between database field names, public DTOs, and portable
    transfer records.
    """

    @staticmethod
    def to_dto(tab: Tab) -> TabDTO:
        """Convert a Saved Tab row to its complete response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab (Tab): Tab value consumed by this operation.

        Returns:
            TabDTO: Result produced by the operation described above.
        """
        return TabDTO(
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
            archived_at=stored_utc(tab.archived_at),
            hidden_until=stored_utc(tab.hidden_until),
            created_at=stored_utc(tab.created_at) or tab.created_at,
            updated_at=stored_utc(tab.updated_at) or tab.updated_at,
        )

    @classmethod
    def to_projection(cls, tab: Tab, fields: str) -> TabDTO | TabProjectionDTO:
        """Convert a Saved Tab to the requested field projection.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab (Tab): Tab value consumed by this operation.
            fields (str): Requested response projection controlling which fields are serialized.

        Returns:
            TabDTO | TabProjectionDTO: Result produced by the operation described above.
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

    @staticmethod
    def from_create_dto(
        dto: TabCreateDTO, *, group_id: str | None, position: float, tags: list[Tag]
    ) -> Tab:
        """Create a Saved Tab occurrence without URL normalization.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TabCreateDTO): Validated data-transfer object supplied to the operation.
            group_id (str | None): Stable identifier of the group targeted by the operation.
            position (float): Position value consumed by this operation.
            tags (list[Tag]): Tags value consumed by this operation.

        Returns:
            Tab: Result produced by the operation described above.
        """
        values: dict[str, Any] = {
            "url": dto.url,
            "title": dto.title or dto.url,
            "note": dto.note or "",
            "agent_review": dto.agent_review or "",
            "viewed": dto.viewed,
            "group_id": group_id,
            "position": position,
            "archived": False,
            "archived_at": None,
            "hidden_until": None,
            "tags": tags,
        }
        if dto.id is not None:
            values["id"] = dto.id
        return Tab(**values)

    @staticmethod
    def to_update_dict(dto: TabUpdateDTO) -> dict[str, Any]:
        """Convert explicitly supplied fields to ORM names.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TabUpdateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            dict[str, Any]: Result produced by the operation described above.
        """
        values = dto.model_dump(exclude_unset=True)
        for field in ("note", "agent_review"):
            if field in values and values[field] is None:
                values[field] = ""
        return values
