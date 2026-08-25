"""Tab tools for MCP operations."""
from __future__ import annotations

import asyncio
from typing import List, Optional, Dict, Any

from mcp.types import ToolAnnotations
from mcp import tool

from .resources import TabResource, READ, IDEMPOTENT_WRITE


# Define the tab resource instance
tab_resource = TabResource(None)  # Will be set during initialization


async def initialize_tab_resource(client):
    """Initialize the tab resource with a client.

    Args:
        client: MCPClient instance
    """
    global tab_resource
    tab_resource = TabResource(client)


@tool(annotations=READ, structured_output=True)
async def get_tab_by_url(url: str) -> Optional[Dict[str, Any]]:
    """Get tab by URL.
    
    Args:
        url: The URL to search for
        
    Returns:
        Tab data if found, None otherwise
    """
    return await tab_resource.get_tab_by_url(url)


@tool(annotations=READ, structured_output=True)
async def list_tabs_by_url(url: str) -> List[Dict[str, Any]]:
    """List all tabs with the given URL.
    
    Args:
        url: The URL to search for
        
    Returns:
        List of tab data
    """
    return await tab_resource.list_tabs_by_url(url)


@tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def update_tabs_by_url(url: str, title: Optional[str] = None, note: Optional[str] = None, 
                           agent_review: Optional[str] = None, tags: Optional[List[str]] = None,
                           group_id: Optional[str] = None, position: Optional[float] = None,
                           archived: Optional[bool] = None, hidden_until: Optional[str] = None) -> List[Dict[str, Any]]:
    """Update all tabs with the given URL.
    
    Args:
        url: The URL to search for
        title: New title (optional)
        note: New note (optional)
        agent_review: New agent review (optional)
        tags: New tags list (optional)
        group_id: New group ID (optional)
        position: New position (optional)
        archived: New archived status (optional)
        hidden_until: New hidden until date (optional)
        
    Returns:
        List of updated tab data
    """
    updates = {
        key: value for key, value in locals().items() 
        if key not in ['url', 'self'] and value is not None
    }
    return await tab_resource.update_tabs_by_url(url, **updates)


@tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def create_tab(url: str, title: Optional[str] = None, note: str = "", 
                    agent_review: str = "", tags: List[str] = None,
                    group_id: Optional[str] = None, position: Optional[float] = None) -> Dict[str, Any]:
    """Create a new tab.
    
    Args:
        url: The URL to create
        title: Tab title (optional)
        note: Tab note (optional)
        agent_review: Agent review (optional)
        tags: List of tags (optional)
        group_id: Group ID (optional)
        position: Position in group (optional)
        
    Returns:
        Created tab data
    """
    tab_data = {
        "url": url,
        "title": title,
        "note": note,
        "agent_review": agent_review,
        "tags": tags or [],
        "group_id": group_id,
        "position": position
    }
    return await tab_resource.create_tab(**{k: v for k, v in tab_data.items() if v is not None})


@tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def tag_tabs_by_url(url: str, tag_name: str) -> List[Dict[str, Any]]:
    """Add a tag to all tabs with the given URL.
    
    Args:
        url: The URL to search for
        tag_name: Name of the tag to add
        
    Returns:
        List of updated tab data
    """
    return await tab_resource.tag_tabs_by_url(url, tag_name)


@tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def untag_tabs_by_url(url: str, tag_name: str) -> List[Dict[str, Any]]:
    """Remove a tag from all tabs with the given URL.
    
    Args:
        url: The URL to search for
        tag_name: Name of the tag to remove
        
    Returns:
        List of updated tab data
    """
    return await tab_resource.untag_tabs_by_url(url, tag_name)


@tool(annotations=READ, structured_output=True)
async def list_tabs(**params) -> Dict[str, Any]:
    """List tabs with optional filtering.
    
    Args:
        **params: Filter parameters
        
    Returns:
        Paginated list of tabs
    """
    return await tab_resource.list_tabs(**params)