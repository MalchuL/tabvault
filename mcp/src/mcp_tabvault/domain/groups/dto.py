"""Define the ID-free Group contracts exposed through MCP."""

from __future__ import annotations

from datetime import datetime

from mcp_tabvault.client.dto import DTO, PaginatedResponseDTO


class GroupViewDTO(DTO):
    """Represent one Group without exposing persistence identity or position."""

    name: str
    category: str
    description: str
    color: str | None
    created_at: datetime
    updated_at: datetime
    tab_count: int = 0


class GroupDeleteViewDTO(DTO):
    """Describe a Group deletion without exposing persistence identity."""

    name: str
    archived_tab_count: int
    deleted_at: datetime


class GroupResponseViewDTO(DTO):
    """Wrap one successful ID-free Group result."""

    success: bool = True
    data: GroupViewDTO


class GroupDeleteResponseViewDTO(DTO):
    """Wrap one successful ID-free Group deletion result."""

    success: bool = True
    data: GroupDeleteViewDTO


GroupListViewDTO = PaginatedResponseDTO[GroupViewDTO]
