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
    return {group.id: group.name for group in groups}


def to_view(tab: TabDTO, groups: list[GroupDTO]) -> TabViewDTO:
    """Replace private Group identity with its public name and remove Tab identity."""
    group = None
    if tab.group_id is not None:
        group = _names_by_id(groups).get(tab.group_id)
        if group is None:
            raise MCPClientError("Saved Tab belongs to a Group that is not accessible through MCP")
    return TabViewDTO(
        url=tab.url,
        title=tab.title,
        favicon=tab.favicon,
        note=tab.note,
        agent_review=tab.agent_review,
        viewed=tab.viewed,
        custom_properties=tab.custom_properties,
        tags=tab.tags,
        group=group,
        archived=tab.archived,
        archived_at=tab.archived_at,
        hidden_until=tab.hidden_until,
        created_at=tab.created_at,
        updated_at=tab.updated_at,
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
