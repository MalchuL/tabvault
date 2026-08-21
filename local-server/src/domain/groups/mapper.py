"""Map group DTOs and persistence models."""

from typing import Any

from lib.time import utc_now
from models import Group

from .dto import GroupCreateDTO, GroupDTO, GroupUpdateDTO


class GroupMapper:
    """Convert between group DTOs and ORM models."""

    @staticmethod
    def to_dto(group: Group, tab_count: int = 0) -> GroupDTO:
        """Convert a group row to a response DTO."""
        return GroupDTO(
            id=group.id,
            name=group.name,
            parent_id=group.parent_id,
            color=group.color,
            position=group.position,
            created_at=group.created_at,
            updated_at=group.updated_at,
            tab_count=tab_count,
        )

    @staticmethod
    def from_create_dto(dto: GroupCreateDTO, position: float) -> Group:
        """Create a group model from a validated request."""
        values: dict[str, Any] = {
            "name": dto.name,
            "parent_id": dto.parent_id,
            "color": dto.color,
            "position": position,
            "archived": dto.archived,
            "archived_at": dto.archived_at,
            "created_at": dto.created_at or utc_now(),
            "updated_at": dto.updated_at or utc_now(),
        }
        if dto.id:
            values["id"] = dto.id
        return Group(**values)

    @staticmethod
    def to_update_dict(dto: GroupUpdateDTO) -> dict[str, Any]:
        """Convert an update DTO to supplied ORM field values."""
        return dto.model_dump(exclude_unset=True)
