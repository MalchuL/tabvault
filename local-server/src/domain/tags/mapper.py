"""Map tag DTOs and persistence models."""

from lib.time import utc_now
from models import Tag

from .dto import TagDTO, TagUpsertDTO


class TagMapper:
    """Convert between tag DTOs and ORM models.

    Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
    boundary and centralizes differences between database field names, public DTOs, and portable
    transfer records.
    """

    @staticmethod
    def to_dto(tag: Tag, count: int) -> TagDTO:
        """Convert a tag row and usage count to a response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tag (Tag): Tag value consumed by this operation.
            count (int): Count value consumed by this operation.

        Returns:
            TagDTO: Result produced by the operation described above.
        """
        return TagDTO(
            name=tag.name,
            description=tag.description,
            created_at=tag.created_at,
            updated_at=tag.updated_at,
            tab_count=count,
        )

    @staticmethod
    def from_upsert_dto(name: str, dto: TagUpsertDTO) -> Tag:
        """Create a tag model from an upsert request.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            name (str): Human-readable name used by the operation.
            dto (TagUpsertDTO): Validated data-transfer object supplied to the operation.

        Returns:
            Tag: Result produced by the operation described above.
        """
        return Tag(name=name, description=dto.description)

    @staticmethod
    def to_update_dict(dto: TagUpsertDTO) -> dict[str, object]:
        """Map an upsert request to existing tag fields.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TagUpsertDTO): Validated data-transfer object supplied to the operation.

        Returns:
            dict[str, object]: Result produced by the operation described above.
        """
        return {"description": dto.description, "updated_at": utc_now()}
