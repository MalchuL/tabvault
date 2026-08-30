"""Register MCP tools for Tag operations."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TabTagDTO, TagListQueryDTO, TagListResponseDTO
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.domain.tabs import mapper as tab_mapper
from mcp_tabvault.domain.tabs import utils as tab_utils
from mcp_tabvault.domain.tabs.dto import TabResponseViewDTO
from mcp_tabvault.server import IDEMPOTENT_WRITE, READ, mcp


@mcp.tool(annotations=READ, structured_output=True)
async def list_tags(limit: int = 100, offset: int = 0) -> TagListResponseDTO:
    """List known tags and their descriptions."""
    return await get_client().list_tags(TagListQueryDTO(limit=limit, offset=offset))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def tag_tab(url: str, tagName: str) -> TabResponseViewDTO:
    """Attach one tag to the oldest visible exact-URL match."""
    tab = await tab_utils.first_visible_tab(url)
    response = await get_client().tag_tab(tab.id, TabTagDTO(tag_name=tagName))
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=tab_mapper.to_view(response.data, groups))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def untag_tab(url: str, tagName: str) -> TabResponseViewDTO:
    """Detach one tag from the oldest visible exact-URL match."""
    tab = await tab_utils.first_visible_tab(url)
    response = await get_client().untag_tab(tab.id, tagName)
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=tab_mapper.to_view(response.data, groups))
