"""Map Saved Tab DTOs and persistence models."""

from __future__ import annotations

from typing import Any

from lib.time import stored_utc
from models import Tab, Tag

from .dto import TabCreateDTO, TabDTO, TabProjectionDTO, TabUpdateDTO


class TabMapper:
    """Convert between Saved Tab DTOs and ORM models."""

    @staticmethod
    def to_dto(tab: Tab) -> TabDTO:
        """Convert a Saved Tab row to its complete response DTO."""
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
            archived_at=tab.archived_at,
            hidden_until=stored_utc(tab.hidden_until),
            created_at=tab.created_at,
            updated_at=tab.updated_at,
        )

    @classmethod
    def to_projection(cls, tab: Tab, fields: str) -> TabDTO | TabProjectionDTO:
        """Convert a Saved Tab to the requested field projection."""
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
        """Create a Saved Tab occurrence without URL normalization."""
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
        """Convert explicitly supplied fields to ORM names."""
        values = dto.model_dump(exclude_unset=True)
        for field in ("note", "agent_review"):
            if field in values and values[field] is None:
                values[field] = ""
        return values
