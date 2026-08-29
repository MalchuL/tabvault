"""Expose user-selected Saved Tab workflows as MCP prompts."""

from __future__ import annotations

from mcp_tabvault.server import mcp


@mcp.prompt(
    name="organize_unassigned",
    description="Review Unassigned tabs and propose organization before changing anything.",
)
def organize_unassigned(limit: int = 50) -> str:
    """Build a two-phase workflow for organizing Unassigned tabs."""
    return f"""Review up to {limit} visible Saved Tabs from tabvault://unassigned?limit={limit}.
Use list_groups and list_tags to reuse existing names. Identify useful Group moves and tag changes,
including exact-URL duplicates as separate save occurrences. First present a concise plan with the
number of affected records. Do not mutate anything until I explicitly approve the plan. After
approval, apply changes with the single-record move_tab, tag_tab, and untag_tab tools."""


@mcp.prompt(
    name="weekly_tab_review",
    description="Review recent visible activity and propose safe library cleanup.",
)
def weekly_tab_review(period: str = "7 days") -> str:
    """Build a non-mutating weekly review workflow."""
    return f"""Review visible TabVault activity from the last {period}, starting with
tabvault://recent?limit=50 and using search_tabs when useful. Summarize new themes, unread material,
Unassigned tabs, and exact-URL duplicate occurrences. Propose cleanup actions, but do not archive,
delete, move, or retag anything without my explicit approval. Hidden and archived content is outside
this MCP workflow."""
