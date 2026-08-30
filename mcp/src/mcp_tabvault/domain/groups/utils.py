"""Implement typed asynchronous Group use cases behind MCP tools."""

from __future__ import annotations

from mcp_tabvault.client import MCPClientError, get_client
from mcp_tabvault.client.dto import GroupDTO, GroupListQueryDTO


async def visible_groups() -> list[GroupDTO]:
    """Return every visible Group in the API's newest-first order.

    Returns:
        list[GroupDTO]: Complete visible Group collection.

    Raises:
        MCPClientError: Group pagination is invalid.
    """
    client = get_client()
    offset = 0
    result: list[GroupDTO] = []
    while True:
        response = await client.list_groups(
            GroupListQueryDTO(visibility="visible", limit=100, offset=offset)
        )
        result.extend(response.data)
        if not response.has_next:
            return result
        if response.size <= 0:
            raise MCPClientError("TabVault API returned an invalid Group page size")
        offset += response.size


def group_named(groups: list[GroupDTO], name: str) -> GroupDTO:
    """Return the oldest case-insensitive exact Group-name match."""
    match = next(
        (group for group in reversed(groups) if group.name.casefold() == name.casefold()), None
    )
    if match is None:
        raise MCPClientError(f"Group named {name!r} is not accessible through MCP")
    return match


def resolve_scope(groups: list[GroupDTO], group: str | None, unassigned_only: bool) -> str | None:
    """Resolve one public Group filter to the private API membership selector."""
    if group is not None and unassigned_only:
        raise ValueError("group and unassignedOnly cannot be used together")
    if unassigned_only:
        return None
    if group is None:
        return "all"
    return group_named(groups, group).id
