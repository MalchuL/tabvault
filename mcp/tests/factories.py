from __future__ import annotations

from datetime import UTC, datetime

from mcp_bridge.client.dto import GroupDTO, TabDTO, TagDTO

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def tab(
    tab_id: str = "tab",
    url: str = "https://exact",
    *,
    archived: bool = False,
    hidden_until: datetime | None = None,
) -> TabDTO:
    return TabDTO(
        id=tab_id,
        url=url,
        title="Title",
        favicon=None,
        note="Note",
        agent_review="Review",
        viewed=False,
        tags=["docs"],
        group_id=None,
        position=0,
        archived=archived,
        archived_at=NOW if archived else None,
        hidden_until=hidden_until,
        created_at=NOW,
        updated_at=NOW,
    )


def group(group_id: str = "group") -> GroupDTO:
    return GroupDTO(
        id=group_id,
        name="Group",
        category="manual",
        description="Context",
        color=None,
        position=0,
        created_at=NOW,
        updated_at=NOW,
        tab_count=0,
    )


def tag(name: str = "docs") -> TagDTO:
    return TagDTO(
        name=name,
        description=None,
        created_at=NOW,
        updated_at=NOW,
        tab_count=1,
    )
