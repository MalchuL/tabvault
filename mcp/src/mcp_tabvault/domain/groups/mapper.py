"""Map private API Group contracts to ID-free MCP views."""

from __future__ import annotations

from mcp_tabvault.client.dto import GroupDTO, GroupListResponseDTO

from .dto import GroupListViewDTO, GroupViewDTO


def to_view(group: GroupDTO) -> GroupViewDTO:
    """Remove persistence-only Group fields from an MCP result."""
    return GroupViewDTO(
        name=group.details.name,
        category=group.details.category,
        description=group.details.description,
        color=group.details.color,
        created_at=group.timestamps.created_at,
        updated_at=group.timestamps.updated_at,
        tab_count=group.counts.tab_count,
    )


def to_page(response: GroupListResponseDTO) -> GroupListViewDTO:
    """Map one API Group page while preserving pagination metadata."""
    return GroupListViewDTO(
        data=[to_view(group) for group in response.data],
        has_next=response.has_next,
        size=response.size,
        total=response.total,
    )
