"""Typed requests and results for Saved Tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, TypeAlias
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

from lib.dto_config import DTO, model_config
from lib.pagination import PaginatedResponse

from .visibility import TabVisibility

TabSortBy: TypeAlias = Literal["position", "createdAt", "updatedAt", "title"]
SortDirection: TypeAlias = Literal["asc", "desc"]


def _validate_saved_url(value: str) -> str:
    """Validate an HTTP(S) URL without changing its original representation.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Args:
        value (str): URL supplied for a saved tab.

    Returns:
        str: Original URL after confirming it uses HTTP or HTTPS.

    Raises:
        ValueError: The URL lacks an HTTP(S) scheme or network location.
    """
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be an absolute HTTP or HTTPS URL")
    return value


class TabCreateContentDTO(BaseModel):
    """Content fields for TabCreateDTO."""

    url: str = Field(min_length=1, max_length=4096)
    title: str | None = Field(default=None, max_length=1024)
    _url_is_http = field_validator("url")(_validate_saved_url)
    model_config = model_config()


class TabCreateAnnotationsDTO(BaseModel):
    """Annotations fields for TabCreateDTO."""

    custom_properties: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list, max_length=64)
    model_config = model_config()


class TabCreatePlacementDTO(BaseModel):
    """Placement fields for TabCreateDTO."""

    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    model_config = model_config()


class TabCreateDTO(BaseModel):
    """Describe one Saved Tab occurrence to create. Fields are grouped by responsibility."""

    id: str | None = Field(default=None, max_length=128)
    model_config = model_config()
    content: TabCreateContentDTO
    annotations: TabCreateAnnotationsDTO = Field(default_factory=TabCreateAnnotationsDTO)
    placement: TabCreatePlacementDTO = Field(default_factory=TabCreatePlacementDTO)


class TabBatchCreateDTO(BaseModel):
    """Describe an atomic batch of distinct Saved Tab occurrences.

    Browser capture uses this command to persist one Session's tabs in a single transaction while
    preserving a separate identity for every occurrence. Validation rejects empty
    and unbounded batches before the service opens a transaction.

    Attributes:
        tabs (list[TabCreateDTO]): One to one thousand occurrences to create atomically, in display
            order.
    """

    tabs: list[TabCreateDTO] = Field(min_length=1, max_length=1000)
    model_config = model_config()


class TabListOptionsFiltersDTO(BaseModel):
    """Filters fields for TabListOptionsDTO."""

    group_id: str | None = "all"
    category: str | None = None
    tags_any: list[str] = Field(default_factory=list)
    tags_all: list[str] = Field(default_factory=list)
    search: str | None = None
    visibility: TabVisibility = "visible"
    model_config = model_config()


class TabListOptionsOrderingDTO(BaseModel):
    """Ordering fields for TabListOptionsDTO."""

    sort_by: TabSortBy = "position"
    sort_dir: SortDirection = "asc"
    model_config = model_config()


class TabListOptionsDTO(BaseModel):
    """Collect filters and projection options for a Saved Tab list. Fields are grouped by responsibility."""

    fields: str = "full"
    model_config = model_config()
    filters: TabListOptionsFiltersDTO = Field(default_factory=TabListOptionsFiltersDTO)
    ordering: TabListOptionsOrderingDTO = Field(default_factory=TabListOptionsOrderingDTO)


class TabUpdateContentDTO(DTO):
    """Content fields for TabUpdateDTO."""

    url: str | None = Field(default=None, min_length=1, max_length=4096)
    title: str | None = Field(default=None, min_length=1, max_length=1024)
    _url_is_http = field_validator("url")(
        lambda value: _validate_saved_url(value) if value is not None else value
    )


class TabUpdateAnnotationsDTO(DTO):
    """Annotations fields for TabUpdateDTO."""

    custom_properties: dict[str, Any] | None = None
    tags: list[str] | None = Field(default=None, max_length=64)


class TabUpdatePlacementDTO(DTO):
    """Placement fields for TabUpdateDTO."""

    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)


class TabUpdateLifecycleDTO(DTO):
    """Lifecycle fields for TabUpdateDTO."""

    archived: bool | None = None
    hidden_until: datetime | None = None


class TabUpdateDTO(DTO):
    """Describe explicitly supplied Saved Tab fields. Fields are grouped by responsibility."""

    content: TabUpdateContentDTO = Field(default_factory=TabUpdateContentDTO)
    annotations: TabUpdateAnnotationsDTO = Field(default_factory=TabUpdateAnnotationsDTO)
    placement: TabUpdatePlacementDTO = Field(default_factory=TabUpdatePlacementDTO)
    lifecycle: TabUpdateLifecycleDTO = Field(default_factory=TabUpdateLifecycleDTO)


class TabReorderDTO(BaseModel):
    """Describe one ordered subset of active tabs in a single membership scope.

    The client sends IDs from first to last for one persisted Group or for Unassigned. Tabs omitted
    because they were concurrently created or hidden retain their relative order after the supplied
    IDs, so a reorder never deletes or strands records that the caller did not load.

    Attributes:
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        tab_ids (list[str]): Unique active Saved Tab IDs in their desired relative order.
    """

    group_id: str | None = Field(default=None, max_length=128)
    tab_ids: list[str]
    model_config = model_config()

    @field_validator("tab_ids")
    @classmethod
    def tab_ids_are_unique(cls, value: list[str]) -> list[str]:
        """Reject ambiguous orders containing the same Saved Tab more than once.

        Args:
            value (list[str]): Caller-supplied IDs in the desired relative order.

        Returns:
            list[str]: The unchanged order when every identifier is unique.

        Raises:
            ValueError: At least one Saved Tab identifier occurs more than once.
        """
        if len(value) != len(set(value)):
            raise ValueError("tabIds must not contain duplicates")
        return value


class TabReorderResultDTO(BaseModel):
    """Confirm the ordered IDs accepted for one membership scope.

    Attributes:
        group_id (str | None): Group whose positions changed, or ``None`` for Unassigned.
        tab_ids (list[str]): Caller-supplied IDs whose relative order was applied.
    """

    group_id: str | None
    tab_ids: list[str]
    model_config = model_config()


class TabTagDTO(BaseModel):
    """Describe a tag to attach to one Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tag_name (str): Name of the tag to attach or remove.
    """

    tag_name: str = Field(min_length=1, max_length=256)
    model_config = model_config()


class TabContentDTO(DTO):
    """Content fields for TabDTO."""

    url: str
    title: str


class TabAnnotationsDTO(DTO):
    """Annotations fields for TabDTO."""

    custom_properties: dict[str, Any]
    tags: list[str]


class TabPlacementDTO(DTO):
    """Placement fields for TabDTO."""

    group_id: str | None
    position: float


class TabLifecycleDTO(DTO):
    """Lifecycle fields for TabDTO."""

    archived: bool
    archived_at: datetime | None
    hidden_until: datetime | None


class TabTimestampsDTO(DTO):
    """Timestamps fields for TabDTO."""

    created_at: datetime
    updated_at: datetime


class TabDTO(DTO):
    """Represent one complete Saved Tab. Fields are grouped by responsibility."""

    id: str
    content: TabContentDTO
    annotations: TabAnnotationsDTO
    placement: TabPlacementDTO
    lifecycle: TabLifecycleDTO
    timestamps: TabTimestampsDTO


class TabProjectionContentDTO(DTO):
    """Content fields for TabProjectionDTO."""

    url: str | None = None
    title: str | None = None


class TabProjectionAnnotationsDTO(DTO):
    """Annotations fields for TabProjectionDTO."""

    custom_properties: dict[str, Any] | None = None
    tags: list[str] | None = None


class TabProjectionPlacementDTO(DTO):
    """Placement fields for TabProjectionDTO."""

    group_id: str | None = None
    position: float | None = None


class TabProjectionLifecycleDTO(DTO):
    """Lifecycle fields for TabProjectionDTO."""

    archived: bool | None = None
    archived_at: datetime | None = None
    hidden_until: datetime | None = None


class TabProjectionTimestampsDTO(DTO):
    """Timestamps fields for TabProjectionDTO."""

    created_at: datetime | None = None
    updated_at: datetime | None = None


class TabProjectionDTO(DTO):
    """Represent a caller-selected subset of Saved Tab fields. Fields are grouped by responsibility."""

    id: str | None = None
    content: TabProjectionContentDTO = Field(default_factory=TabProjectionContentDTO)
    annotations: TabProjectionAnnotationsDTO = Field(default_factory=TabProjectionAnnotationsDTO)
    placement: TabProjectionPlacementDTO = Field(default_factory=TabProjectionPlacementDTO)
    lifecycle: TabProjectionLifecycleDTO = Field(default_factory=TabProjectionLifecycleDTO)
    timestamps: TabProjectionTimestampsDTO = Field(default_factory=TabProjectionTimestampsDTO)


class TabListResponseDTO(PaginatedResponse[TabDTO | TabProjectionDTO]):
    """Expose a paginated list of Saved Tabs."""


class TabDeleteResultDTO(DTO):
    """Describe an archived or permanently deleted Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        deleted_at (datetime): UTC instant associated with deleted.
        hard (bool): Whether deletion removes the archived record permanently.
    """

    id: str
    deleted_at: datetime
    hard: bool
