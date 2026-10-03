"""Expose read-only Tag context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TagListQueryDTO, TagListResponseDTO
from mcp_tabvault.server import mcp


@mcp.resource(
    "tabvault://tags",
    name="tags",
    title="Library Tags",
    description="First 100 known tags with usage counts and pagination; use list_tags for more.",
    mime_type="application/json",
)
async def tags() -> TagListResponseDTO:
    """Return the first page of known tags without changing the library.

    Returns:
        TagListResponseDTO: Up to 100 tags and pagination metadata.

    Raises:
        MCPClientError: API access fails.
    """
    return await get_client().list_tags(TagListQueryDTO(limit=100))
