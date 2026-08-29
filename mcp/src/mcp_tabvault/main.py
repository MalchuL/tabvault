"""Run the standalone TabVault MCP server."""

from __future__ import annotations

from mcp_tabvault.domain.groups import prompts as group_prompts
from mcp_tabvault.domain.groups import resources as group_resources
from mcp_tabvault.domain.groups import tools as group_tools
from mcp_tabvault.domain.tabs import prompts as tab_prompts
from mcp_tabvault.domain.tabs import resources as tab_resources
from mcp_tabvault.domain.tabs import tools as tab_tools
from mcp_tabvault.domain.tags import resources as tag_resources
from mcp_tabvault.domain.tags import tools as tag_tools
from mcp_tabvault.server import mcp

REGISTRATION_MODULES = (
    group_prompts,
    group_resources,
    group_tools,
    tab_prompts,
    tab_resources,
    tab_tools,
    tag_resources,
    tag_tools,
)


def main() -> None:
    """Run the MCP server over its configured transport.

    Importing the registration modules above executes their top-level decorators exactly once
    before the official SDK starts its default transport.
    """
    mcp.run()


if __name__ == "__main__":
    main()
