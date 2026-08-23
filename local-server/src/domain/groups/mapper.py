"""Map Group DTOs and persistence models."""

from typing import Any

from lib.time import utc_now
from models import Group

from .dto import GroupCreateDTO, GroupDTO, GroupUpdateDTO


class GroupMapper:
    """Convert between Group DTOs and ORM models."""

    @staticmethod
    def to_dto(group: Group, tab_count: int = 0) -> GroupDTO:
        """Convert a Group row to its response DTO."""
        return GroupDTO(
            id=group.id,
            name=group.name,
            category=group.category,
            description=group.description,
            color=group.color,
            position=group.position,
            created_at=group.created_at,
            updated_at=group.updated_at,
            tab_count=tab_count,
        )

    @staticmethod
    def from_create_dto(dto: GroupCreateDTO, position: float) -> Group:
        """Create a Group row from a validated request."""
        values: dict[str, Any] = {
            "name": dto.name,
            "category": dto.category,
            "description": dto.description or "",
            "color": dto.color,
            "position": position,
            "created_at": dto.created_at or utc_now(),
            "updated_at": dto.updated_at or utc_now(),
        }
        if dto.id is not None:
            values["id"] = dto.id
        return Group(**values)

    @staticmethod
    def to_update_dict(dto: GroupUpdateDTO) -> dict[str, Any]:
        """Convert explicitly supplied fields to ORM names."""
        values = dto.model_dump(exclude_unset=True)
        if "description" in values and values["description"] is None:
            values["description"] = ""
        return values
