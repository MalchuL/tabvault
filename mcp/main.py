"""Main entry point for TabVault MCP server."""
import asyncio
import logging
import os
from typing import Optional

from mcp.server import Server
from mcp.types import Tool
from mcp import tool

# Import tools from domain layers
from mcp.domain.tabs.tools import (
    get_tab_by_url,
    list_tabs_by_url,
    update_tabs_by_url,
    create_tab,
    tag_tabs_by_url,
    untag_tabs_by_url,
    list_tabs
)
from mcp.domain.groups.resources import GroupResource
from mcp.domain.tags.resources import TagResource

# Import the client
from mcp.client import MCPClient

logger = logging.getLogger(__name__)

# Global server instance
server: Optional[Server] = None


async def initialize_server():
    """Initialize the MCP server with all tools."""
    global server
    
    # Get configuration from environment variables
    server_url = os.environ.get("TABVAULT_SERVER_URL", "http://localhost:47821")
    api_key = os.environ.get("TABVAULT_API_KEY", "admin")
    
    # Create client - note: we now use URL as the single parameter
    # The API key should be handled via headers in the client itself
    async with MCPClient(server_url) as client:
        # Initialize domain resources with the client
        from mcp.domain.tabs.tools import initialize_tab_resource
        await initialize_tab_resource(client)
        
        # Create server instance
        server = Server("tabvault-mcp")
        
        # Register all tools
        tools = [
            get_tab_by_url,
            list_tabs_by_url,
            update_tabs_by_url,
            create_tab,
            tag_tabs_by_url,
            untag_tabs_by_url,
            list_tabs
        ]
        
        for t in tools:
            server.tools.register(t)
            
        return server


async def main():
    """Main entry point."""
    try:
        server = await initialize_server()
        if server:
            await server.start()
    except Exception as e:
        logger.error(f"Failed to start MCP server: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())