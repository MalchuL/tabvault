"""Map tag DTOs and persistence models."""

from lib.time import utc_now
from models import Tag

from .dto import TagDTO, TagUpsertDTO


class TagMapper:
    """Convert between tag DTOs and ORM models."""

    @staticmethod
    def to_dto(tag: Tag, count: int) -> TagDTO:
        """Convert a tag row and usage count to a response DTO."""
        return TagDTO(
            name=tag.name,
            description=tag.description,
            created_at=tag.created_at,
            updated_at=tag.updated_at,
            tab_count=count,
        )

    @staticmethod
    def from_upsert_dto(name: str, dto: TagUpsertDTO) -> Tag:
        """Create a tag model from an upsert request."""
        return Tag(name=name, description=dto.description)

    @staticmethod
    def to_update_dict(dto: TagUpsertDTO) -> dict[str, object]:
        """Map an upsert request to existing tag fields."""
        return {"description": dto.description, "updated_at": utc_now()}
