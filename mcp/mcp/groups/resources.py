"""Group resources for MCP operations."""
from __future__ import annotations

from typing import List, Optional, Dict, Any

from mcp.types import ToolAnnotations

from ...client import MCPClient


# Define tool annotations
READ: ToolAnnotations = {"mcp:read": {}}
IDEMPOTENT_WRITE: ToolAnnotations = {"mcp:idempotentWrite": {}}


class GroupResource:
    """Group resources for MCP operations."""

    def __init__(self, client: MCPClient):
        """Initialize group resource.

        Args:
            client: MCP client instance
        """
        self.client = client

    async def get_group_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get group by name.

        Args:
            name: Name of the group to search for

        Returns:
            Group data if found, None otherwise
        """
        return await self.client.get_group_by_name(name)

    async def list_groups(self) -> List[Dict[str, Any]]:
        """List all groups.

        Returns:
            List of group data
        """
        return await self.client.list_groups()

    async def create_group(self, name: str, category: str = "") -> Dict[str, Any]:
        """Create a new group.

        Args:
            name: Name of the group
            category: Category for the group

        Returns:
            Created group data
        """
        return await self.client.create_group(name, category)