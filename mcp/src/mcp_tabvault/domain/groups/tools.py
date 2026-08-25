"""Register top-level asynchronous MCP tools for Group operations."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import (
    GroupCreateDTO,
    GroupDeleteResponseDTO,
    GroupListQueryDTO,
    GroupListResponseDTO,
    GroupResponseDTO,
    GroupTabsQueryDTO,
    GroupUpdateDTO,
)
from mcp_tabvault.server import DESTRUCTIVE, IDEMPOTENT_WRITE, READ, WRITE, mcp

from . import utils


@mcp.tool(annotations=READ, structured_output=True)
async def list_groups(
    category: str | None = None, limit: int = 100, offset: int = 0
) -> GroupListResponseDTO:
    """List visible flat Groups, optionally restricted by category."""
    return await get_client().list_groups(
        GroupListQueryDTO(category=category, limit=limit, offset=offset)
    )


@mcp.tool(annotations=WRITE, structured_output=True)
async def create_group(
    name: str, description: str = "", color: str | None = None
) -> GroupResponseDTO:
    """Create a Manual Group."""
    return await get_client().create_group(
        GroupCreateDTO(name=name, description=description, color=color)
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def update_group(
    id: str,
    name: str | None = None,
    description: str | None = None,
    color: str | None = None,
    position: float | None = None,
) -> GroupResponseDTO:
    """Update a visible Group and keep it classified as Manual."""
    await utils.require_visible_group(id)
    values: dict[str, object | None] = {
        "name": name,
        "description": description,
        "color": color,
        "position": position,
        "category": "manual",
    }
    body = GroupUpdateDTO.model_validate(
        {key: value for key, value in values.items() if value is not None}
    )
    return await get_client().update_group(id, body)


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
async def delete_group(id: str) -> GroupDeleteResponseDTO:
    """Delete a visible Group when it contains no hidden members."""
    await utils.require_visible_group(id)
    hidden = await get_client().list_group_tabs(
        id, GroupTabsQueryDTO(visibility="hidden", fields="minimal", limit=1)
    )
    if hidden.data:
        raise RuntimeError("Group is not accessible through MCP")
    return await get_client().delete_group(id)
