"""Expose read-only Saved Tab context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TabListQueryDTO, TabListResponseDTO, TabResponseDTO
from mcp_tabvault.server import mcp


@mcp.resource(
    "tabvault://recent{?limit}",
    name="recent-tabs",
    description="Most recently updated active visible Saved Tabs.",
    mime_type="application/json",
)
async def recent_tabs(limit: int = 50) -> TabListResponseDTO:
    """Return recently updated visible Saved Tabs using a compact projection."""
    return await get_client().list_tabs(
        TabListQueryDTO(sort_by="updatedAt", sort_dir="desc", limit=limit, fields="minimal")
    )


@mcp.resource(
    "tabvault://unassigned{?limit}",
    name="unassigned-tabs",
    description="Active visible Saved Tabs that do not belong to a Group.",
    mime_type="application/json",
)
async def unassigned_tabs(limit: int = 50) -> TabListResponseDTO:
    """Return visible Unassigned Saved Tabs using a compact projection."""
    return await get_client().list_tabs(
        TabListQueryDTO(group_id="unassigned", limit=limit, fields="minimal")
    )


@mcp.resource(
    "tabvault://tabs/{tabId}",
    name="saved-tab",
    description="One complete active visible Saved Tab.",
    mime_type="application/json",
)
async def saved_tab(tabId: str) -> TabResponseDTO:
    """Return one complete Saved Tab by its stable identifier."""
    return await get_client().get_tab(tabId)
