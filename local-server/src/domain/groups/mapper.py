"""Map Group DTOs and persistence models."""

from typing import Any

from lib.time import stored_utc, utc_now
from models import Group

from .dto import GroupCreateDTO, GroupDTO, GroupUpdateDTO


class GroupMapper:
    """Convert between Group DTOs and ORM models.

    Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
    boundary and centralizes differences between database field names, public DTOs, and portable
    transfer records.
    """

    @staticmethod
    def to_dto(group: Group, tab_count: int = 0) -> GroupDTO:
        """Convert a Group row to its response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            group (Group): Group row being converted or persisted.
            tab_count (int): Number of tabs associated with this record.

        Returns:
            GroupDTO: Serializable group fields for the API response.
        """
        return GroupDTO(
            id=group.id,
            name=group.name,
            category=group.category,
            description=group.description,
            color=group.color,
            position=group.position,
            created_at=stored_utc(group.created_at) or group.created_at,
            updated_at=stored_utc(group.updated_at) or group.updated_at,
            tab_count=tab_count,
        )

    @staticmethod
    def from_create_dto(dto: GroupCreateDTO, position: float) -> Group:
        """Create a Group row from a validated request.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (GroupCreateDTO): Validated data-transfer object supplied to the operation.
            position (float): Display position assigned within the target group.

        Returns:
            Group: Unsaved Group model initialized from the request.
        """
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
        """Convert explicitly supplied fields to ORM names.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (GroupUpdateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            dict[str, Any]: Explicitly supplied fields keyed by ORM attribute name.
        """
        values = dto.model_dump(exclude_unset=True)
        if "description" in values and values["description"] is None:
            values["description"] = ""
        return values
