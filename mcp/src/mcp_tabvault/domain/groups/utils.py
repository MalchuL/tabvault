"""Implement typed asynchronous Group use cases behind MCP tools."""

from __future__ import annotations

from mcp_tabvault.client import MCPClientError, get_client
from mcp_tabvault.client.dto import (
    GroupListQueryDTO,
)


async def require_visible_group(group_id: str) -> None:
    """Require a Group to appear in the complete visible collection.

    Args:
        group_id (str): Stable Group identifier supplied by an MCP caller.

    Raises:
        MCPClientError: The Group is absent, hidden, or pagination is invalid.
    """
    client = get_client()
    offset = 0
    while True:
        response = await client.list_groups(
            GroupListQueryDTO(visibility="visible", limit=100, offset=offset)
        )
        if any(group.id == group_id for group in response.data):
            return
        if not response.has_next:
            raise MCPClientError("Group is not accessible through MCP")
        if response.size <= 0:
            raise MCPClientError("TabVault API returned an invalid Group page size")
        offset += response.size
