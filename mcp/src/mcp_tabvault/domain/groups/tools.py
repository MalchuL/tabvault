"""Register name-addressed MCP tools for Group operations."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import (
    GroupCreateDTO,
    GroupListQueryDTO,
    GroupTabsQueryDTO,
    GroupUpdateDTO,
)
from mcp_tabvault.server import DESTRUCTIVE, IDEMPOTENT_WRITE, READ, WRITE, mcp

from . import mapper, utils
from .dto import (
    GroupDeleteResponseViewDTO,
    GroupDeleteViewDTO,
    GroupListViewDTO,
    GroupResponseViewDTO,
)


@mcp.tool(annotations=READ, structured_output=True)
async def list_groups(
    category: str | None = None, limit: int = 100, offset: int = 0
) -> GroupListViewDTO:
    """List visible Groups without persistence identity or display position."""
    response = await get_client().list_groups(
        GroupListQueryDTO(category=category, limit=limit, offset=offset)
    )
    return mapper.to_page(response)


@mcp.tool(annotations=READ, structured_output=True)
async def get_group(name: str) -> GroupResponseViewDTO:
    """Read the oldest visible case-insensitive exact Group-name match."""
    group = utils.group_named(await utils.visible_groups(), name)
    return GroupResponseViewDTO(data=mapper.to_view(group))


@mcp.tool(annotations=WRITE, structured_output=True)
async def create_group(
    name: str, description: str = "", color: str | None = None
) -> GroupResponseViewDTO:
    """Create a Manual Group and return its ID-free view."""
    response = await get_client().create_group(
        GroupCreateDTO(name=name, description=description, color=color)
    )
    return GroupResponseViewDTO(data=mapper.to_view(response.data))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def update_group(
    name: str,
    newName: str | None = None,
    description: str | None = None,
    color: str | None = None,
) -> GroupResponseViewDTO:
    """Update the oldest visible case-insensitive exact Group-name match."""
    group = utils.group_named(await utils.visible_groups(), name)
    values: dict[str, object | None] = {
        "name": newName,
        "description": description,
        "color": color,
        "category": "manual",
    }
    body = GroupUpdateDTO.model_validate(
        {key: value for key, value in values.items() if value is not None}
    )
    response = await get_client().update_group(group.id, body)
    return GroupResponseViewDTO(data=mapper.to_view(response.data))


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
async def delete_group(name: str) -> GroupDeleteResponseViewDTO:
    """Delete the oldest visible matching Group when it has no hidden members."""
    group = utils.group_named(await utils.visible_groups(), name)
    hidden = await get_client().list_group_tabs(
        group.id, GroupTabsQueryDTO(visibility="hidden", fields="minimal", limit=1)
    )
    if hidden.size > 0:
        raise RuntimeError(f"Group named {name!r} is not accessible through MCP")
    response = await get_client().delete_group(group.id)
    return GroupDeleteResponseViewDTO(
        data=GroupDeleteViewDTO(
            name=group.name,
            archived_tab_count=response.data.archived_tab_count,
            deleted_at=response.data.deleted_at,
        )
    )
