"""Typed requests and results for flat Group use cases."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import DTO, model_config
from lib.pagination import PaginatedResponse


class GroupCreateDTO(DTO):
    """Describe one Group to create.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        name (str): Human-readable name of this record.
        category (str): Free-form Group category, such as ``session`` or ``manual``.
        description (str | None): Optional human-readable explanatory text.
        color (str | None): Optional accent color displayed in the library.
        position (float | None): Stable display position within the current Group or Unassigned
            section.
        id (str | None): Stable identifier for this record.
        created_at (datetime | None): UTC instant at which the record was created.
        updated_at (datetime | None): UTC instant at which the record was last changed.
    """

    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default="", max_length=20_000)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    id: str | None = Field(default=None, max_length=128)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class GroupUpdateDTO(BaseModel):
    """Describe explicitly supplied Group fields.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        name (str | None): Human-readable name of this record.
        category (str | None): Free-form Group category, such as ``session`` or ``manual``.
        description (str | None): Optional human-readable explanatory text.
        color (str | None): Optional accent color displayed in the library.
        position (float | None): Stable display position within the current Group or Unassigned
            section.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=20_000)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    model_config = model_config()


class GroupDTO(DTO):
    """Represent one flat Group.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        name (str): Human-readable name of this record.
        category (str): Free-form Group category, such as ``session`` or ``manual``.
        description (str): Optional human-readable explanatory text.
        color (str | None): Optional accent color displayed in the library.
        position (float): Stable display position within the current Group or Unassigned section.
        created_at (datetime): UTC instant at which the record was created.
        updated_at (datetime): UTC instant at which the record was last changed.
        tab_count (int): Number of tab records represented by this object.
    """

    id: str
    name: str
    category: str
    description: str
    color: str | None
    position: float
    created_at: datetime
    updated_at: datetime
    tab_count: int = 0


class GroupListResponseDTO(PaginatedResponse[GroupDTO]):
    """Expose a paginated list of Groups."""


class GroupDeleteResultDTO(DTO):
    """Describe permanent Group deletion and archived members.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        archived_tab_count (int): Number of archived tab records represented by this object.
        deleted_at (datetime): UTC instant associated with deleted.
    """

    id: str
    archived_tab_count: int
    deleted_at: datetime
