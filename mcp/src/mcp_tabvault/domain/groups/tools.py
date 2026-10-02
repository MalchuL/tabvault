"""Register name-addressed MCP tools for Group operations."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import (
    GroupCreateDTO,
    GroupListQueryDTO,
    GroupTabsQueryDTO,
    GroupUpdateDTO,
)
from mcp_tabvault.server import DESTRUCTIVE, READ, WRITE, mcp

from . import mapper, utils
from .dto import (
    GroupDeleteResponseViewDTO,
    GroupDeleteViewDTO,
    GroupListViewDTO,
    GroupResponseViewDTO,
)


@mcp.tool(title="List Groups", annotations=READ, structured_output=True)
async def list_groups(
    category: Annotated[
        str | None, Field(description="Group category filter; null includes all categories.")
    ] = None,
    limit: Annotated[
        int, Field(ge=1, le=100, description="Maximum records per page, from 1 to 100.")
    ] = 100,
    offset: Annotated[
        int,
        Field(
            ge=0, description="Records to skip; advance by the returned size while hasNext is true."
        ),
    ] = 0,
) -> GroupListViewDTO:
    """List one page of visible Groups with metadata and tab counts.

    Use offset to continue while hasNext is true.

    Args:
        category (str | None): Group category filter; null includes all categories.
        limit (int): Maximum records per page, from 1 to 100.
        offset (int): Records to skip; advance by the returned size while hasNext is true.

    Returns:
        GroupListViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
    """
    response = await get_client().list_groups(
        GroupListQueryDTO(category=category, limit=limit, offset=offset)
    )
    return mapper.to_page(response)


@mcp.tool(title="Read Group", annotations=READ, structured_output=True)
async def get_group(
    name: Annotated[
        str,
        Field(
            min_length=1,
            max_length=200,
            description="Exact visible Group name, ignoring case; selects the oldest match.",
        ),
    ],
) -> GroupResponseViewDTO:
    """Read the oldest visible case-insensitive exact Group-name match.

    Names may collide; this tool returns one Group without persistence identifiers.

    Args:
        name (str): Exact visible Group name, ignoring case; selects the oldest match.

    Returns:
        GroupResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
    """
    group = utils.group_named(await utils.visible_groups(), name)
    return GroupResponseViewDTO(data=mapper.to_view(group))


@mcp.tool(title="Create Group", annotations=WRITE, structured_output=True)
async def create_group(
    name: Annotated[
        str,
        Field(
            min_length=1,
            max_length=200,
            description="Name of the new Manual Group, from 1 to 200 characters.",
        ),
    ],
    description: Annotated[
        str,
        Field(
            max_length=20000, description="Group description; empty string stores no description."
        ),
    ] = "",
    color: Annotated[
        str | None,
        Field(max_length=32, description="Optional accent color used by the library UI."),
    ] = None,
) -> GroupResponseViewDTO:
    """Create a new Manual Group.

    Creates a separate Group even when an existing name matches.

    Args:
        name (str): Name of the new Manual Group, from 1 to 200 characters.
        description (str): Group description; empty string stores no description.
        color (str | None): Optional accent color used by the library UI.

    Returns:
        GroupResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Supplied fields fail request validation.
    """
    response = await get_client().create_group(
        GroupCreateDTO.model_validate(
            {"details": {"name": name, "description": description, "color": color}}
        )
    )
    return GroupResponseViewDTO(data=mapper.to_view(response.data))


@mcp.tool(title="Update Group", annotations=DESTRUCTIVE, structured_output=True)
async def update_group(
    name: Annotated[
        str,
        Field(
            min_length=1,
            max_length=200,
            description="Exact visible Group name, ignoring case; selects the oldest match.",
        ),
    ],
    newName: Annotated[
        str | None,
        Field(
            min_length=1,
            max_length=200,
            description="Replacement Group name; null leaves the name unchanged.",
        ),
    ] = None,
    description: Annotated[
        str | None,
        Field(
            max_length=20000,
            description="Replacement description; empty string clears it; null leaves it unchanged.",
        ),
    ] = None,
    color: Annotated[
        str | None,
        Field(
            max_length=32,
            description="Replacement accent color; null leaves it unchanged and cannot clear it.",
        ),
    ] = None,
) -> GroupResponseViewDTO:
    """Update the oldest visible case-insensitive exact Group-name match.

    Supplied fields replace existing values; omitted or null fields stay unchanged. Always sets
    category to manual. Renaming can make retries select another same-name Group.

    Args:
        name (str): Exact visible Group name, ignoring case; selects the oldest match.
        newName (str | None): Replacement Group name; null leaves the name unchanged.
        description (str | None): Replacement description; empty string clears it; null leaves
            it unchanged.
        color (str | None): Replacement accent color; null leaves it unchanged and cannot clear
            it.

    Returns:
        GroupResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Supplied fields fail request validation.
    """
    group = utils.group_named(await utils.visible_groups(), name)
    values: dict[str, object | None] = {
        "name": newName,
        "description": description,
        "color": color,
        "category": "manual",
    }
    body = GroupUpdateDTO.model_validate(
        {"details": {key: value for key, value in values.items() if value is not None}}
    )
    response = await get_client().update_group(group.id, body)
    return GroupResponseViewDTO(data=mapper.to_view(response.data))


@mcp.tool(title="Delete Group", annotations=DESTRUCTIVE, structured_output=True)
async def delete_group(
    name: Annotated[
        str,
        Field(
            min_length=1,
            max_length=200,
            description="Exact visible Group name, ignoring case; selects the oldest match.",
        ),
    ],
) -> GroupDeleteResponseViewDTO:
    """Delete the oldest visible matching Group and archive its Saved Tabs.

    Refuses Groups containing hidden tabs. Archived tabs can be recovered through the human UI.
    Retrying can delete another same-name Group.

    Args:
        name (str): Exact visible Group name, ignoring case; selects the oldest match.

    Returns:
        GroupDeleteResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        RuntimeError: The selected Group contains hidden tabs.
    """
    group = utils.group_named(await utils.visible_groups(), name)
    hidden = await get_client().list_group_tabs(
        group.id, GroupTabsQueryDTO(visibility="hidden", fields="minimal", limit=1)
    )
    if hidden.size > 0:
        raise RuntimeError(f"Group named {name!r} is not accessible through MCP")
    response = await get_client().delete_group(group.id)
    return GroupDeleteResponseViewDTO(
        data=GroupDeleteViewDTO(
            name=group.details.name,
            archived_tab_count=response.data.archived_tab_count,
            deleted_at=response.data.deleted_at,
        )
    )
