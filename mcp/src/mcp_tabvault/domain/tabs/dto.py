"""Define the ID-free Saved Tab contracts exposed through MCP."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from mcp_tabvault.client.dto import (
    DTO,
    IssueDTO,
    PaginatedResponseDTO,
    SearchMetaDTO,
    WarningDTO,
)


class TabViewContentDTO(DTO):
    """Content fields for TabViewDTO."""

    url: str
    title: str
    favicon: str | None


class TabViewAnnotationsDTO(DTO):
    """Annotations fields for TabViewDTO."""

    note: str
    agent_review: str
    viewed: bool = False
    custom_properties: dict[str, Any]
    tags: list[str]


class TabViewPlacementDTO(DTO):
    """Placement fields for TabViewDTO."""

    group: str | None


class TabViewLifecycleDTO(DTO):
    """Lifecycle fields for TabViewDTO."""

    archived: bool
    archived_at: datetime | None
    hidden_until: datetime | None


class TabViewTimestampsDTO(DTO):
    """Timestamps fields for TabViewDTO."""

    created_at: datetime
    updated_at: datetime


class TabViewDTO(DTO):
    """Represent one Saved Tab without persistence identity or display position. Fields are grouped by responsibility."""

    content: TabViewContentDTO
    annotations: TabViewAnnotationsDTO
    placement: TabViewPlacementDTO
    lifecycle: TabViewLifecycleDTO
    timestamps: TabViewTimestampsDTO


class TabDeleteViewDTO(DTO):
    """Describe one archived Tab without exposing persistence identity."""

    url: str
    deleted_at: datetime
    hard: bool


class SearchItemViewDTO(DTO):
    """Represent one scored ID-free Saved Tab search result."""

    tab: TabViewDTO
    score: float
    match_type: Literal["both", "semantic", "keyword"]
    matched_on: Literal["title", "url", "note", "agentReview", "tags", "semantic"]


class SearchDataViewDTO(DTO):
    """Contain scored ID-free Saved Tab search results."""

    results: list[SearchItemViewDTO]


class TabResponseViewDTO(DTO):
    """Wrap one successful ID-free Saved Tab result."""

    success: bool = True
    data: TabViewDTO


class TabDeleteResponseViewDTO(DTO):
    """Wrap one successful ID-free Saved Tab deletion result."""

    success: bool = True
    data: TabDeleteViewDTO


class SearchResponseViewDTO(DTO):
    """Wrap ID-free search data with backend timing and diagnostic metadata."""

    success: bool = True
    data: SearchDataViewDTO
    meta: SearchMetaDTO | None = Field(default=None, exclude_if=lambda value: value is None)
    warnings: list[WarningDTO] | None = Field(default=None, exclude_if=lambda value: value is None)
    errors: list[IssueDTO] | None = Field(default=None, exclude_if=lambda value: value is None)


TabListViewDTO = PaginatedResponseDTO[TabViewDTO]


class TabChangesDTO(DTO):
    """Editable Saved Tab fields; omitted or null values leave the record unchanged."""

    new_url: str | None = Field(
        default=None,
        min_length=1,
        max_length=4096,
        description="Replacement absolute HTTP(S) URL; null leaves it unchanged.",
    )
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=1024,
        description="Replacement nonempty title; null leaves it unchanged.",
    )
    note: str | None = Field(
        default=None,
        max_length=20000,
        description="Replacement note; empty string clears it; null leaves it unchanged.",
    )
    agent_review: str | None = Field(
        default=None,
        max_length=20000,
        description="Replacement agent review; empty string clears it; null leaves it unchanged.",
    )
    viewed: bool | None = Field(
        default=None, description="Replacement viewed state; null leaves it unchanged."
    )
    tags: list[str] | None = Field(
        default=None,
        max_length=64,
        description="Replace tags; [] clears them; null leaves them unchanged.",
    )
    hidden_until: str | None = Field(
        default=None, description="ISO 8601 hide deadline; null leaves it unchanged."
    )
