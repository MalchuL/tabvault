"""Expose read-only Saved Tab context as MCP resources."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TabListQueryDTO
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.server import mcp

from . import mapper, utils
from .dto import TabListViewDTO, TabResponseViewDTO


@mcp.resource(
    "tabvault://recent{?limit}",
    name="recent-tabs",
    title="Recent Saved Tabs",
    description="Most recently updated active visible Saved Tabs.",
    mime_type="application/json",
)
async def recent_tabs(
    limit: Annotated[int, Field(ge=1, le=100, description="Snapshot size, from 1 to 100.")] = 50,
) -> TabListViewDTO:
    """Return a bounded page of recently updated visible Saved Tabs.

    Args:
        limit (int): Maximum records in the snapshot, between 1 and 100.

    Returns:
        TabListViewDTO: ID-free records and pagination metadata.

    Raises:
        ValueError: The limit is outside the supported bounds.
        MCPClientError: API access fails or returned records cannot be mapped.
    """
    query = TabListQueryDTO(sort_by="updatedAt", sort_dir="desc", limit=limit, fields="full")
    groups = await group_utils.visible_groups()
    response = await get_client().list_tabs(query)
    return mapper.to_page(response, groups)


@mcp.resource(
    "tabvault://unassigned{?limit}",
    name="unassigned-tabs",
    title="Unassigned Saved Tabs",
    description="Active visible Saved Tabs that do not belong to a Group.",
    mime_type="application/json",
)
async def unassigned_tabs(
    limit: Annotated[int, Field(ge=1, le=100, description="Snapshot size, from 1 to 100.")] = 50,
) -> TabListViewDTO:
    """Return a bounded page of visible Unassigned Saved Tabs.

    Args:
        limit (int): Maximum records in the snapshot, between 1 and 100.

    Returns:
        TabListViewDTO: ID-free records and pagination metadata.

    Raises:
        ValueError: The limit is outside the supported bounds.
        MCPClientError: API access fails or returned records cannot be mapped.
    """
    response = await get_client().list_tabs(
        TabListQueryDTO(group_id="unassigned", limit=limit, fields="full")
    )
    return mapper.to_page(response, [])


@mcp.resource(
    "tabvault://tabs{?url}",
    name="saved-tab",
    title="Saved Tab by Original URL",
    description="One complete active visible Saved Tab.",
    mime_type="application/json",
)
async def saved_tab(url: str = "") -> TabResponseViewDTO:
    """Return the oldest visible Saved Tab with one exact original URL.

    Args:
        url (str): Original URL decoded from the resource query, without normalization.

    Returns:
        TabResponseViewDTO: The ID-free oldest active visible matching record.

    Raises:
        ValueError: The URL is missing or blank.
        MCPClientError: No accessible match exists or API access or mapping fails.
    """
    tab = await utils.first_visible_tab(url)
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=mapper.to_view(tab, groups))
