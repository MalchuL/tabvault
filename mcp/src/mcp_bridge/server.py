"""Own the MCP server and shared tool safety annotations."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

from mcp_bridge.client import close_client, get_client

READ = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)
WRITE = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=False,
    open_world_hint=False,
)
IDEMPOTENT_WRITE = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)
DESTRUCTIVE = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=True,
    idempotent_hint=False,
    open_world_hint=False,
)


@asynccontextmanager
async def lifespan(_: MCPServer[None]) -> AsyncGenerator[None]:
    """Create and close the singleton HTTP client with the MCP process.

    Args:
        _ (MCPServer[None]): Server instance whose lifespan owns the client.

    Yields:
        None: The server has no additional request context beyond the singleton client.
    """
    get_client()
    try:
        yield None
    finally:
        await close_client()


mcp = MCPServer("TabVault", lifespan=lifespan)
