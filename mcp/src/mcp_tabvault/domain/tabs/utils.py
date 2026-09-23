"""Implement typed asynchronous Saved Tab use cases behind MCP tools."""

from __future__ import annotations

from datetime import UTC, datetime

from mcp_tabvault.client import MCPClientError, get_client
from mcp_tabvault.client.dto import (
    TabDTO,
    TabListQueryDTO,
)


def is_hidden(tab: TabDTO) -> bool:
    """Return whether a Saved Tab has a future visibility deadline.

    Args:
        tab (TabDTO): Complete Saved Tab returned by the API.

    Returns:
        bool: Whether the visibility deadline is in the future.
    """
    if tab.hidden_until is None:
        return False
    deadline = tab.hidden_until
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)
    return deadline > datetime.now(UTC)


async def first_visible_tab(url: str) -> TabDTO:
    """Return the oldest active visible Saved Tab with one exact stored URL.

    Args:
        url (str): Stored URL to match case-sensitively.

    Returns:
        TabDTO: Oldest exact visible match.

    Raises:
        MCPClientError: Pagination is invalid or a full projection is not returned.
    """
    client = get_client()
    offset = 0
    while True:
        response = await client.list_tabs(
            TabListQueryDTO(
                group_id="all",
                search=url,
                limit=100,
                offset=offset,
                fields="full",
                sort_by="createdAt",
                sort_dir="asc",
                visibility="visible",
            )
        )
        for item in response.data:
            if not isinstance(item, TabDTO):
                raise MCPClientError("TabVault API returned an incomplete Saved Tab")
            if item.url == url and not item.archived and not is_hidden(item):
                return item
        if not response.has_next:
            raise MCPClientError(f"Saved Tab with URL {url!r} is not accessible through MCP")
        if response.size <= 0:
            raise MCPClientError("TabVault API returned an invalid Saved Tab page size")
        offset += response.size
