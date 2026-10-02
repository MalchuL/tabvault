"""Typed requests and results for flat Group use cases."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import DTO, model_config
from lib.pagination import PaginatedResponse


class GroupCreateDetailsDTO(DTO):
    """Details fields for GroupCreateDTO."""

    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default="", max_length=20_000)
    color: str | None = Field(default=None, max_length=32)


class GroupCreatePlacementDTO(DTO):
    """Placement fields for GroupCreateDTO."""

    position: float | None = Field(default=None, ge=0)


class GroupCreateTimestampsDTO(DTO):
    """Timestamps fields for GroupCreateDTO."""

    created_at: datetime | None = None
    updated_at: datetime | None = None


class GroupCreateDTO(DTO):
    """Describe one Group to create. Fields are grouped by responsibility."""

    id: str | None = Field(default=None, max_length=128)
    details: GroupCreateDetailsDTO
    placement: GroupCreatePlacementDTO = Field(default_factory=GroupCreatePlacementDTO)
    timestamps: GroupCreateTimestampsDTO = Field(default_factory=GroupCreateTimestampsDTO)


class GroupUpdateDetailsDTO(BaseModel):
    """Details fields for GroupUpdateDTO."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=20_000)
    color: str | None = Field(default=None, max_length=32)
    model_config = model_config()


class GroupUpdatePlacementDTO(BaseModel):
    """Placement fields for GroupUpdateDTO."""

    position: float | None = Field(default=None, ge=0)
    model_config = model_config()


class GroupUpdateDTO(BaseModel):
    """Describe explicitly supplied Group fields. Fields are grouped by responsibility."""

    model_config = model_config()
    details: GroupUpdateDetailsDTO = Field(default_factory=GroupUpdateDetailsDTO)
    placement: GroupUpdatePlacementDTO = Field(default_factory=GroupUpdatePlacementDTO)


class GroupDetailsDTO(DTO):
    """Details fields for GroupDTO."""

    name: str
    category: str
    description: str
    color: str | None


class GroupPlacementDTO(DTO):
    """Placement fields for GroupDTO."""

    position: float


class GroupTimestampsDTO(DTO):
    """Timestamps fields for GroupDTO."""

    created_at: datetime
    updated_at: datetime


class GroupCountsDTO(DTO):
    """Counts fields for GroupDTO."""

    tab_count: int = 0


class GroupDTO(DTO):
    """Represent one flat Group. Fields are grouped by responsibility."""

    id: str
    details: GroupDetailsDTO
    placement: GroupPlacementDTO
    timestamps: GroupTimestampsDTO
    counts: GroupCountsDTO = Field(default_factory=GroupCountsDTO)


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
