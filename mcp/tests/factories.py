from __future__ import annotations

from datetime import UTC, datetime

from mcp_tabvault.client.dto import GroupDTO, TabDTO, TagDTO

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def tab(
    tab_id: str = "tab",
    url: str = "https://exact",
    *,
    archived: bool = False,
    hidden_until: datetime | None = None,
) -> TabDTO:
    return TabDTO.model_validate(
        {
            "id": tab_id,
            "content": {"url": url, "title": "Title", "favicon": None},
            "annotations": {
                "note": "Note",
                "agent_review": "Review",
                "viewed": False,
                "tags": ["docs"],
            },
            "placement": {"group_id": None, "position": 0},
            "lifecycle": {
                "archived": archived,
                "archived_at": NOW if archived else None,
                "hidden_until": hidden_until,
            },
            "timestamps": {"created_at": NOW, "updated_at": NOW},
        }
    )


def group(group_id: str = "group") -> GroupDTO:
    return GroupDTO.model_validate(
        {
            "id": group_id,
            "details": {
                "name": "Group",
                "category": "manual",
                "description": "Context",
                "color": None,
            },
            "placement": {"position": 0},
            "timestamps": {"created_at": NOW, "updated_at": NOW},
            "counts": {"tab_count": 0},
        }
    )


def tag(name: str = "docs") -> TagDTO:
    return TagDTO(
        name=name,
        description=None,
        created_at=NOW,
        updated_at=NOW,
        tab_count=1,
    )
