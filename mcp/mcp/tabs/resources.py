"""Tab resources for MCP operations."""
from __future__ import annotations

from typing import List, Optional, Dict, Any

from mcp.types import ToolAnnotations

from ...client import MCPClient
from ...dto import (
    TabDTO,
    TabCreateDTO,
    TabUpdateDTO,
    TabDeleteResultDTO
)


# Define tool annotations
READ: ToolAnnotations = {"mcp:read": {}}
IDEMPOTENT_WRITE: ToolAnnotations = {"mcp:idempotentWrite": {}}


class TabResource:
    """Tab resources for MCP operations."""

    def __init__(self, client: MCPClient):
        """Initialize tab resource.

        Args:
            client: MCP client instance
        """
        self.client = client

    async def get_tab_by_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Get tab by URL.

        Args:
            url: The URL to search for

        Returns:
            Tab data if found, None otherwise
        """
        tab = await self.client.get_tab_by_url(url)
        return tab.model_dump() if tab else None

    async def list_tabs_by_url(self, url: str) -> List[Dict[str, Any]]:
        """List all tabs with the given URL.

        Args:
            url: The URL to search for

        Returns:
            List of tab data
        """
        tabs = await self.client.list_tabs_by_url(url)
        return [tab.model_dump() for tab in tabs]

    async def update_tabs_by_url(self, url: str, **updates) -> List[Dict[str, Any]]:
        """Update all tabs with the given URL.

        Args:
            url: The URL to search for
            **updates: Fields to update

        Returns:
            List of updated tab data
        """
        updated_tabs = await self.client.update_tabs_by_url(url, updates)
        return [tab.model_dump() for tab in updated_tabs]

    async def create_tab(self, **tab_data) -> Dict[str, Any]:
        """Create a new tab.

        Args:
            **tab_data: Tab creation data

        Returns:
            Created tab data
        """
        create_dto = TabCreateDTO(**tab_data)
        tab = await self.client.create_tab(create_dto)
        return tab.model_dump()

    async def delete_tab(self, tab_id: str, hard: bool = False) -> Dict[str, Any]:
        """Delete a tab.

        Args:
            tab_id: ID of the tab to delete
            hard: Whether to permanently delete or archive

        Returns:
            Deletion result
        """
        result = await self.client.delete_tab(tab_id, hard)
        return result.model_dump()

    async def tag_tabs_by_url(self, url: str, tag_name: str) -> List[Dict[str, Any]]:
        """Add a tag to all tabs with the given URL.

        Args:
            url: The URL to search for
            tag_name: Name of the tag to add

        Returns:
            List of updated tab data
        """
        updated_tabs = await self.client.tag_tab_by_url(url, tag_name)
        return [tab.model_dump() for tab in updated_tabs]

    async def untag_tabs_by_url(self, url: str, tag_name: str) -> List[Dict[str, Any]]:
        """Remove a tag from all tabs with the given URL.

        Args:
            url: The URL to search for
            tag_name: Name of the tag to remove

        Returns:
            List of updated tab data
        """
        updated_tabs = await self.client.untag_tab_by_url(url, tag_name)
        return [tab.model_dump() for tab in updated_tabs]

    async def list_tabs(self, **params) -> Dict[str, Any]:
        """List tabs with optional filtering.

        Args:
            **params: Filter parameters

        Returns:
            Paginated list of tabs
        """
        response = await self.client.list_tabs(**params)
        return {
            "items": [tab.model_dump() for tab in response.items],
            "total": response.total,
            "limit": response.limit,
            "offset": response.offset
        }