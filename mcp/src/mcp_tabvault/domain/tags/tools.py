"""Register MCP tools for Tag operations."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TabTagDTO, TagListQueryDTO, TagListResponseDTO
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.domain.tabs import mapper as tab_mapper
from mcp_tabvault.domain.tabs import utils as tab_utils
from mcp_tabvault.domain.tabs.dto import TabResponseViewDTO
from mcp_tabvault.server import IDEMPOTENT_WRITE, READ, mcp


@mcp.tool(title="List Tags", annotations=READ, structured_output=True)
async def list_tags(
    limit: Annotated[
        int, Field(ge=1, le=100, description="Maximum records per page, from 1 to 100.")
    ] = 100,
    offset: Annotated[
        int,
        Field(
            ge=0, description="Records to skip; advance by the returned size while hasNext is true."
        ),
    ] = 0,
) -> TagListResponseDTO:
    """List one page of known tags, descriptions, and visible usage counts.

    Use offset to continue while hasNext is true.

    Args:
        limit (int): Maximum records per page, from 1 to 100.
        offset (int): Records to skip; advance by the returned size while hasNext is true.

    Returns:
        TagListResponseDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
    """
    return await get_client().list_tags(TagListQueryDTO(limit=limit, offset=offset))


@mcp.tool(title="Tag Saved Tab", annotations=IDEMPOTENT_WRITE, structured_output=True)
async def tag_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Exact original Saved Tab URL; selects the oldest active visible match.",
        ),
    ],
    tagName: Annotated[
        str,
        Field(
            min_length=1,
            max_length=256,
            description="Tag name to attach or detach; existing names match ignoring case.",
        ),
    ],
) -> TabResponseViewDTO:
    """Attach one tag to the oldest active visible exact-URL match.

    Adding an already attached tag is safe to repeat. Only one save occurrence is selected.

    Args:
        url (str): Exact original Saved Tab URL; selects the oldest active visible match.
        tagName (str): Tag name to attach or detach; existing names match ignoring case.

    Returns:
        TabResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Supplied fields fail request validation.
    """
    tab = await tab_utils.first_visible_tab(url)
    response = await get_client().tag_tab(tab.id, TabTagDTO(tag_name=tagName))
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=tab_mapper.to_view(response.data, groups))


@mcp.tool(
    title="Untag Saved Tab",
    annotations=IDEMPOTENT_WRITE.model_copy(update={"destructive_hint": True}),
    structured_output=True,
)
async def untag_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Exact original Saved Tab URL; selects the oldest active visible match.",
        ),
    ],
    tagName: Annotated[
        str,
        Field(
            min_length=1,
            max_length=256,
            description="Tag name to attach or detach; existing names match ignoring case.",
        ),
    ],
) -> TabResponseViewDTO:
    """Remove one tag from the oldest active visible exact-URL match.

    Removes the association from one occurrence; does not delete the tag definition.

    Args:
        url (str): Exact original Saved Tab URL; selects the oldest active visible match.
        tagName (str): Tag name to attach or detach; existing names match ignoring case.

    Returns:
        TabResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: The exact URL is blank.
    """
    tab = await tab_utils.first_visible_tab(url)
    response = await get_client().untag_tab(tab.id, tagName)
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=tab_mapper.to_view(response.data, groups))
