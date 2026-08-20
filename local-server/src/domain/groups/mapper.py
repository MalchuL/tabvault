from models import Group

from .dto import GroupDTO


class GroupMapper:
    @staticmethod
    def to_dto(group: Group, tab_count: int = 0) -> GroupDTO:
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
