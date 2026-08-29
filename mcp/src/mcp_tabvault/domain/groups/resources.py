"""Expose read-only Group context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import GroupListQueryDTO, GroupListResponseDTO
from mcp_tabvault.server import mcp


@mcp.resource(
    "tabvault://groups",
    name="groups",
    description="Visible TabVault Groups with counts and metadata.",
    mime_type="application/json",
)
async def groups() -> GroupListResponseDTO:
    """Return the first page of visible Groups."""
    return await get_client().list_groups(GroupListQueryDTO(limit=100))
