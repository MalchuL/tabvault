"""MCP client for communicating with TabVault server."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from httpx import AsyncClient, HTTPStatusError, RequestError

from .dto import (
    TabDTO,
    TabCreateDTO,
    TabListResponseDTO,
    TabUpdateDTO,
    TabDeleteResultDTO,
    GroupDTO,
    GroupCreateDTO,
    GroupUpdateDTO,
    GroupDeleteResultDTO,
    TagDTO,
    TagCreateDTO,
    TagUpdateDTO,
    TagDeleteResultDTO
)

logger = logging.getLogger(__name__)


class MCPClient:
    """MCP client for communicating with TabVault server."""

    def __init__(self, url: str):
        """Initialize MCP client.
        
        Args:
            url: Full URL of the TabVault server (including protocol and port)
        """
        self.url = url.rstrip('/')
        self._client: Optional[AsyncClient] = None

    async def __aenter__(self) -> MCPClient:
        """Enter async context."""
        headers = {
            "Content-Type": "application/json",
        }
        self._client = AsyncClient(
            base_url=self.url,
            headers=headers,
            timeout=30.0
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit async context."""
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> AsyncClient:
        """Get the underlying HTTP client."""
        if not self._client:
            raise RuntimeError("Client not initialized. Use async context manager.")
        return self._client

    # Tab CRUD operations
    
    async def create_tab(self, tab_dto: TabCreateDTO) -> TabDTO:
        """Create a new tab.
        
        Args:
            tab_dto: Tab creation data
            
        Returns:
            Created tab DTO
        """
        try:
            response = await self.client.post(
                "/api/v1/tabs",
                json=tab_dto.model_dump(exclude_unset=True)
            )
            response.raise_for_status()
            return TabDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to create tab: {e}")
            raise

    async def get_tab(self, tab_id: str) -> Optional[TabDTO]:
        """Get a tab by ID.
        
        Args:
            tab_id: Tab identifier
            
        Returns:
            Tab DTO if found, None otherwise
        """
        try:
            response = await self.client.get(f"/api/v1/tabs/{tab_id}")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return TabDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to get tab {tab_id}: {e}")
            raise

    async def update_tab(self, tab_id: str, updates: TabUpdateDTO) -> TabDTO:
        """Update a tab.
        
        Args:
            tab_id: Tab identifier
            updates: Fields to update
            
        Returns:
            Updated tab DTO
        """
        try:
            response = await self.client.put(
                f"/api/v1/tabs/{tab_id}",
                json=updates.model_dump(exclude_unset=True)
            )
            response.raise_for_status()
            return TabDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to update tab {tab_id}: {e}")
            raise

    async def delete_tab(self, tab_id: str) -> TabDeleteResultDTO:
        """Delete a tab.
        
        Args:
            tab_id: Tab identifier
            
        Returns:
            Deletion result DTO
        """
        try:
            response = await self.client.delete(f"/api/v1/tabs/{tab_id}")
            response.raise_for_status()
            return TabDeleteResultDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to delete tab {tab_id}: {e}")
            raise

    async def list_tabs(self, limit: int = 100, offset: int = 0) -> TabListResponseDTO:
        """List tabs.
        
        Args:
            limit: Maximum number of tabs to return
            offset: Number of tabs to skip
            
        Returns:
            List of tabs
        """
        try:
            response = await self.client.get(
                "/api/v1/tabs",
                params={"limit": limit, "offset": offset}
            )
            response.raise_for_status()
            return TabListResponseDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to list tabs: {e}")
            raise

    # Group CRUD operations
    async def create_group(self, group_dto: GroupCreateDTO) -> GroupDTO:
        """Create a new group.
        
        Args:
            group_dto: Group creation data
            
        Returns:
            Created group DTO
        """
        try:
            response = await self.client.post(
                "/api/v1/groups",
                json=group_dto.model_dump(exclude_unset=True)
            )
            response.raise_for_status()
            return GroupDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to create group: {e}")
            raise

    async def get_group(self, group_id: str) -> Optional[GroupDTO]:
        """Get a group by ID.
        
        Args:
            group_id: Group identifier
            
        Returns:
            Group DTO if found, None otherwise
        """
        try:
            response = await self.client.get(f"/api/v1/groups/{group_id}")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return GroupDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to get group {group_id}: {e}")
            raise

    async def update_group(self, group_id: str, updates: GroupUpdateDTO) -> GroupDTO:
        """Update a group.
        
        Args:
            group_id: Group identifier
            updates: Fields to update
            
        Returns:
            Updated group DTO
        """
        try:
            response = await self.client.put(
                f"/api/v1/groups/{group_id}",
                json=updates.model_dump(exclude_unset=True)
            )
            response.raise_for_status()
            return GroupDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to update group {group_id}: {e}")
            raise

    async def delete_group(self, group_id: str) -> GroupDeleteResultDTO:
        """Delete a group.
        
        Args:
            group_id: Group identifier
            
        Returns:
            Deletion result DTO
        """
        try:
            response = await self.client.delete(f"/api/v1/groups/{group_id}")
            response.raise_for_status()
            return GroupDeleteResultDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to delete group {group_id}: {e}")
            raise

    async def list_groups(self, limit: int = 100, offset: int = 0) -> List[GroupDTO]:
        """List groups.
        
        Args:
            limit: Maximum number of groups to return
            offset: Number of groups to skip
            
        Returns:
            List of groups
        """
        try:
            response = await self.client.get(
                "/api/v1/groups",
                params={"limit": limit, "offset": offset}
            )
            response.raise_for_status()
            return [GroupDTO.model_validate(item) for item in response.json()]
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to list groups: {e}")
            raise

    # Tag CRUD operations
    async def create_tag(self, tag_dto: TagCreateDTO) -> TagDTO:
        """Create a new tag.
        
        Args:
            tag_dto: Tag creation data
            
        Returns:
            Created tag DTO
        """
        try:
            response = await self.client.post(
                "/api/v1/tags",
                json=tag_dto.model_dump(exclude_unset=True)
            )
            response.raise_for_status()
            return TagDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to create tag: {e}")
            raise

    async def get_tag(self, tag_name: str) -> Optional[TagDTO]:
        """Get a tag by name.
        
        Args:
            tag_name: Tag name
            
        Returns:
            Tag DTO if found, None otherwise
        """
        try:
            response = await self.client.get(f"/api/v1/tags/{tag_name}")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return TagDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to get tag {tag_name}: {e}")
            raise

    async def update_tag(self, tag_name: str, updates: TagUpdateDTO) -> TagDTO:
        """Update a tag.
        
        Args:
            tag_name: Tag name
            updates: Fields to update
            
        Returns:
            Updated tag DTO
        """
        try:
            response = await self.client.put(
                f"/api/v1/tags/{tag_name}",
                json=updates.model_dump(exclude_unset=True)
            )
            response.raise_for_status()
            return TagDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to update tag {tag_name}: {e}")
            raise

    async def delete_tag(self, tag_name: str) -> TagDeleteResultDTO:
        """Delete a tag.
        
        Args:
            tag_name: Tag name
            
        Returns:
            Deletion result DTO
        """
        try:
            response = await self.client.delete(f"/api/v1/tags/{tag_name}")
            response.raise_for_status()
            return TagDeleteResultDTO.model_validate(response.json())
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to delete tag {tag_name}: {e}")
            raise

    async def list_tags(self, limit: int = 100, offset: int = 0) -> List[TagDTO]:
        """List tags.
        
        Args:
            limit: Maximum number of tags to return
            offset: Number of tags to skip
            
        Returns:
            List of tags
        """
        try:
            response = await self.client.get(
                "/api/v1/tags",
                params={"limit": limit, "offset": offset}
            )
            response.raise_for_status()
            return [TagDTO.model_validate(item) for item in response.json()]
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to list tags: {e}")
            raise

    # Basic methods for testing
    async def get_health(self) -> Dict[str, Any]:
        """Get server health status."""
        try:
            response = await self.client.get("/api/v1/health")
            response.raise_for_status()
            return response.json()
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to get health status: {e}")
            raise

    # Basic methods for testing
    async def get_health(self) -> Dict[str, Any]:
        """Get server health status."""
        try:
            response = await self.client.get("/api/v1/health")
            response.raise_for_status()
            return response.json()
        except (HTTPStatusError, RequestError) as e:
            logger.error(f"Failed to get health status: {e}")
            raise