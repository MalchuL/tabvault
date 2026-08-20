from models import Tag

from .dto import TagDTO


class TagMapper:
    @staticmethod
    def to_dto(tag: Tag, count: int) -> TagDTO:
        return TagDTO(
            name=tag.name,
            description=tag.description,
            created_at=tag.created_at,
            updated_at=tag.updated_at,
            tab_count=count,
        )
