"""Map tag DTOs and persistence models."""

from lib.time import stored_utc, utc_now
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
            tag (Tag): Tag row being converted or persisted.
            count (int): Number of records processed in this batch.

        Returns:
            TagDTO: Serializable tag fields and usage count.
        """
        return TagDTO(
            name=tag.name,
            description=tag.description,
            created_at=stored_utc(tag.created_at) or tag.created_at,
            updated_at=stored_utc(tag.updated_at) or tag.updated_at,
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
            Tag: Unsaved tag model initialized from the request.
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
            dict[str, object]: Supplied tag fields keyed by ORM attribute name.
        """
        return {"description": dto.description, "updated_at": utc_now()}
