"""Expose the typed client, DTOs, errors, and singleton provider."""

from .client import DEFAULT_SERVER_URL, MCPClient, MCPClientError
from .singleton import close_client, get_client

__all__ = [
    "DEFAULT_SERVER_URL",
    "MCPClient",
    "MCPClientError",
    "close_client",
    "get_client",
]
