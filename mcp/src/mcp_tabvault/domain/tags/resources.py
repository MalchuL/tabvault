"""Expose read-only Tag context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TagListQueryDTO, TagListResponseDTO
from mcp_tabvault.server import mcp


@mcp.resource(
    "tabvault://tags",
    name="tags",
    description="Known TabVault tags with usage counts.",
    mime_type="application/json",
)
async def tags() -> TagListResponseDTO:
    """Return the first page of known tags."""
    return await get_client().list_tags(TagListQueryDTO(limit=100))
