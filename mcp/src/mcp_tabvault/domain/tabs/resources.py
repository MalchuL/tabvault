"""Expose read-only Saved Tab context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import TabListQueryDTO
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.server import mcp

from . import mapper, utils
from .dto import TabListViewDTO, TabResponseViewDTO


@mcp.resource(
    "tabvault://recent{?limit}",
    name="recent-tabs",
    description="Most recently updated active visible Saved Tabs.",
    mime_type="application/json",
)
async def recent_tabs(limit: int = 50) -> TabListViewDTO:
    """Return recently updated visible Saved Tabs using a compact projection."""
    groups = await group_utils.visible_groups()
    response = await get_client().list_tabs(
        TabListQueryDTO(sort_by="updatedAt", sort_dir="desc", limit=limit, fields="full")
    )
    return mapper.to_page(response, groups)


@mcp.resource(
    "tabvault://unassigned{?limit}",
    name="unassigned-tabs",
    description="Active visible Saved Tabs that do not belong to a Group.",
    mime_type="application/json",
)
async def unassigned_tabs(limit: int = 50) -> TabListViewDTO:
    """Return visible Unassigned Saved Tabs using a compact projection."""
    response = await get_client().list_tabs(
        TabListQueryDTO(group_id="unassigned", limit=limit, fields="full")
    )
    return mapper.to_page(response, [])


@mcp.resource(
    "tabvault://tabs{?url}",
    name="saved-tab",
    description="One complete active visible Saved Tab.",
    mime_type="application/json",
)
async def saved_tab(url: str = "") -> TabResponseViewDTO:
    """Return the oldest visible Saved Tab with one exact URL."""
    tab = await utils.first_visible_tab(url)
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=mapper.to_view(tab, groups))
