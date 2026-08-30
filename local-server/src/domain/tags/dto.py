"""Typed requests and results for tag use cases."""

from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import DTO, model_config
from lib.pagination import PaginatedResponse


class TagUpsertDTO(BaseModel):
    """Describe mutable tag metadata.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        description (str | None): Optional human-readable explanatory text.
    """

    description: str | None = Field(default=None, max_length=4096)
    model_config = model_config()


class TagDTO(DTO):
    """Represent a tag and its usage count.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        name (str): Typed name value carried by this object.
        description (str | None): Optional human-readable explanatory text.
        created_at (datetime): UTC instant at which the record was created.
        updated_at (datetime): UTC instant at which the record was last changed.
        tab_count (int): Number of tab records represented by this object.
    """

    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    tab_count: int


class TagListResponseDTO(PaginatedResponse[TagDTO]):
    """Expose a paginated list of tags and their usage counts."""


class TagDeleteResultDTO(BaseModel):
    """Describe a deleted tag and detached tab count.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        name (str): Typed name value carried by this object.
        detached_from_tabs (int): Typed detached from tabs value carried by this object.
    """

    name: str
    detached_from_tabs: int
    model_config = model_config()
