"""Own the process-wide typed TabVault API client."""

from functools import cache

from .client import MCPClient


@cache
def get_client() -> MCPClient:
    """Return the singleton client shared by every MCP tool.

    Returns:
        MCPClient: Environment-configured asynchronous client for this process.
    """
    return MCPClient.from_environment()


async def close_client() -> None:
    """Close and clear the singleton client during MCP shutdown."""
    client = get_client()
    await client.aclose()
    get_client.cache_clear()
