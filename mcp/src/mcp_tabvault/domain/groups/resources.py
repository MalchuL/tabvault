"""Expose read-only Group context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import GroupListQueryDTO
from mcp_tabvault.server import mcp

from . import mapper
from .dto import GroupListViewDTO


@mcp.resource(
    "tabvault://groups",
    name="groups",
    title="Visible Groups",
    description="First 100 visible Groups with counts and pagination; use list_groups for more.",
    mime_type="application/json",
)
async def groups() -> GroupListViewDTO:
    """Return the first page of visible Groups without changing the library.

    Returns:
        GroupListViewDTO: Up to 100 ID-free Groups and pagination metadata.

    Raises:
        MCPClientError: API access fails.
    """
    return mapper.to_page(await get_client().list_groups(GroupListQueryDTO(limit=100)))
