"""Expose user-selected Group workflows as MCP prompts."""

from __future__ import annotations

from mcp_tabvault.server import mcp


@mcp.prompt(
    name="research_digest",
    description="Create a digest from the visible tabs in a named research Group.",
)
def research_digest(group: str, audience: str = "general", format: str = "markdown") -> str:
    """Build a research digest workflow for a Group selected by the user."""
    return f"""Find the visible TabVault Group named {group!r}, then inspect its Saved Tabs with
list_tabs and get_tab using each returned exact URL. Produce a {format} research digest for a
{audience} audience. Organize the material by theme, preserve original URLs, distinguish saved
metadata from your inferences, and mention important gaps. Do not change the library."""
