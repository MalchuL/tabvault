"""Map private API Saved Tab contracts to ID-free MCP views."""

from __future__ import annotations

from mcp_tabvault.client import MCPClientError
from mcp_tabvault.client.dto import GroupDTO, SearchResponseDTO, TabDTO, TabListResponseDTO

from .dto import (
    SearchDataViewDTO,
    SearchItemViewDTO,
    SearchResponseViewDTO,
    TabListViewDTO,
    TabViewDTO,
)


def _names_by_id(groups: list[GroupDTO]) -> dict[str, str]:
    return {group.id: group.details.name for group in groups}


def to_view(tab: TabDTO, groups: list[GroupDTO]) -> TabViewDTO:
    """Replace private Group identity with its public name and remove Tab identity."""
    group = None
    if tab.placement.group_id is not None:
        group = _names_by_id(groups).get(tab.placement.group_id)
        if group is None:
            raise MCPClientError("Saved Tab belongs to a Group that is not accessible through MCP")
    return TabViewDTO.model_validate(
        {
            "content": {
                "url": tab.content.url,
                "title": tab.content.title,
                "favicon": tab.content.favicon,
            },
            "annotations": {
                "note": tab.annotations.note,
                "agent_review": tab.annotations.agent_review,
                "viewed": bool(tab.annotations.custom_properties.get("viewed", False)),
                "custom_properties": tab.annotations.custom_properties,
                "tags": tab.annotations.tags,
            },
            "placement": {"group": group},
            "lifecycle": {
                "archived": tab.lifecycle.archived,
                "archived_at": tab.lifecycle.archived_at,
                "hidden_until": tab.lifecycle.hidden_until,
            },
            "timestamps": {
                "created_at": tab.timestamps.created_at,
                "updated_at": tab.timestamps.updated_at,
            },
        }
    )


def to_page(response: TabListResponseDTO, groups: list[GroupDTO]) -> TabListViewDTO:
    """Map one complete API Tab page while preserving pagination metadata."""
    tabs: list[TabViewDTO] = []
    for item in response.data:
        if not isinstance(item, TabDTO):
            raise MCPClientError("TabVault API returned an incomplete Saved Tab")
        tabs.append(to_view(item, groups))
    return TabListViewDTO(
        data=tabs,
        has_next=response.has_next,
        size=response.size,
        total=response.total,
    )


def to_search(response: SearchResponseDTO, groups: list[GroupDTO]) -> SearchResponseViewDTO:
    """Map scored API results while preserving search metadata and warnings."""
    return SearchResponseViewDTO(
        data=SearchDataViewDTO(
            results=[
                SearchItemViewDTO(
                    tab=to_view(item.tab, groups),
                    score=item.score,
                    match_type=item.match_type,
                    matched_on=item.matched_on,
                )
                for item in response.data.results
            ]
        ),
        meta=response.meta,
        warnings=response.warnings,
        errors=response.errors,
    )
