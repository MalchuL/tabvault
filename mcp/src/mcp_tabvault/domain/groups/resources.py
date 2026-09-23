"""Expose read-only Group context as MCP resources."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import GroupListQueryDTO
from mcp_tabvault.server import mcp

from . import mapper
from .dto import GroupListViewDTO


@mcp.resource(
    "tabvault://groups",
    name="groups",
    description="Visible TabVault Groups with counts and metadata.",
    mime_type="application/json",
)
async def groups() -> GroupListViewDTO:
    """Return the first page of visible Groups."""
    return mapper.to_page(await get_client().list_groups(GroupListQueryDTO(limit=100)))
