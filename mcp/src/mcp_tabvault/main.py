"""Run the standalone TabVault MCP server."""

from __future__ import annotations

from mcp_tabvault.domain.groups import tools as group_tools
from mcp_tabvault.domain.tabs import tools as tab_tools
from mcp_tabvault.domain.tags import tools as tag_tools
from mcp_tabvault.server import mcp

TOOL_MODULES = (group_tools, tab_tools, tag_tools)


def main() -> None:
    """Run the MCP server over its configured transport.

    Importing the domain tool modules above executes their top-level decorators exactly once before
    the official SDK starts its default transport.
    """
    mcp.run()


if __name__ == "__main__":
    main()
