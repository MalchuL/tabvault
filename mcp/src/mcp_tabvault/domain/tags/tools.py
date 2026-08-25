"""Register top-level asynchronous MCP tools for Tag operations."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TabResponseDTO, TabTagDTO, TagListQueryDTO, TagListResponseDTO
from mcp_tabvault.server import IDEMPOTENT_WRITE, READ, mcp


@mcp.tool(annotations=READ, structured_output=True)
async def list_tags(limit: int = 100, offset: int = 0) -> TagListResponseDTO:
    """List known tags and their descriptions."""
    return await get_client().list_tags(TagListQueryDTO(limit=limit, offset=offset))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def tag_tab(tabId: str, tagName: str) -> TabResponseDTO:
    """Attach one tag to one active visible Saved Tab."""
    return await get_client().tag_tab(tabId, TabTagDTO(tag_name=tagName))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def untag_tab(tabId: str, tagName: str) -> TabResponseDTO:
    """Detach one tag from one active visible Saved Tab."""
    return await get_client().untag_tab(tabId, tagName)
