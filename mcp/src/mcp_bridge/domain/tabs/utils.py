"""Implement typed asynchronous Saved Tab use cases behind MCP tools."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from mcp_bridge.client import MCPClientError, get_client
from mcp_bridge.client.dto import (
    TabDTO,
    TabListQueryDTO,
    TabResponseDTO,
    UrlBulkErrorDTO,
    UrlBulkResultDTO,
)

BulkOperation = Callable[[TabDTO], Awaitable[TabResponseDTO]]


def _is_hidden(tab: TabDTO) -> bool:
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


async def require_visible_tab(tab_id: str) -> TabResponseDTO:
    """Load one Saved Tab only when MCP may access it.

    Args:
        tab_id (str): Stable Saved Tab identifier supplied by an MCP caller.

    Returns:
        TabResponseDTO: Typed API envelope for the visible Saved Tab.

    Raises:
        MCPClientError: The Saved Tab is archived or currently hidden.
    """
    response = await get_client().get_tab(tab_id)
    if response.data.archived or _is_hidden(response.data):
        raise MCPClientError("Saved Tab is not accessible through MCP")
    return response


async def _matching_tabs(url: str) -> list[TabDTO]:
    """Collect every active visible Saved Tab with one exact stored URL.

    Args:
        url (str): Stored URL to match case-sensitively.

    Returns:
        list[TabDTO]: Complete exact matches in ordinary API order.

    Raises:
        MCPClientError: Pagination is invalid or a full projection is not returned.
    """
    client = get_client()
    offset = 0
    matches: list[TabDTO] = []
    while True:
        response = await client.list_tabs(
            TabListQueryDTO(
                group_id="all",
                search=url,
                limit=100,
                offset=offset,
                fields="full",
                visibility="visible",
            )
        )
        for item in response.data:
            if not isinstance(item, TabDTO):
                raise MCPClientError("TabVault API returned an incomplete Saved Tab")
            if item.url == url and not item.archived and not _is_hidden(item):
                matches.append(item)
        if not response.has_next:
            return matches
        if not response.data:
            raise MCPClientError("TabVault API returned an invalid empty Saved Tab page")
        offset += len(response.data)


async def _best_effort(tabs: list[TabDTO], operation: BulkOperation) -> UrlBulkResultDTO:
    """Apply one non-transactional operation to every matched Saved Tab.

    Args:
        tabs (list[TabDTO]): Exact visible URL matches to mutate.
        operation (BulkOperation): Typed asynchronous per-tab API operation.

    Returns:
        UrlBulkResultDTO: Successful Tabs and typed per-tab failures.
    """
    data: list[TabDTO] = []
    errors: list[UrlBulkErrorDTO] = []
    for tab in tabs:
        try:
            data.append((await operation(tab)).data)
        except MCPClientError as error:
            errors.append(UrlBulkErrorDTO(tab_id=tab.id, message=str(error)))
    return UrlBulkResultDTO(matched=len(tabs), data=data, errors=errors)
