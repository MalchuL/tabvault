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


class TabViewDTO(DTO):
    """Represent one Saved Tab without persistence identity or display position."""

    url: str
    title: str
    favicon: str | None
    note: str
    agent_review: str
    viewed: bool = False
    custom_properties: dict[str, Any]
    tags: list[str]
    group: str | None
    archived: bool
    archived_at: datetime | None
    hidden_until: datetime | None
    created_at: datetime
    updated_at: datetime


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
