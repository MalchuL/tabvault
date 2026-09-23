"""Register URL-addressed MCP tools for Saved Tab operations."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import (
    SearchDataDTO,
    SearchMode,
    SearchQueryDTO,
    TabCreateDTO,
    TabListQueryDTO,
    TabUpdateDTO,
)
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.server import DESTRUCTIVE, IDEMPOTENT_WRITE, READ, WRITE, mcp

from . import mapper, utils
from .dto import (
    SearchResponseViewDTO,
    TabDeleteResponseViewDTO,
    TabDeleteViewDTO,
    TabListViewDTO,
    TabResponseViewDTO,
)


def _update_dto(
    *,
    new_url: str | None = None,
    title: str | None = None,
    note: str | None = None,
    agent_review: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    hidden_until: str | None = None,
) -> TabUpdateDTO:
    """Build a private update DTO containing only explicitly supplied fields."""
    values: dict[str, object | None] = {
        "url": new_url,
        "title": title,
        "note": note,
        "agent_review": agent_review,
        "viewed": viewed,
        "tags": tags,
        "hidden_until": hidden_until,
    }
    return TabUpdateDTO.model_validate(
        {key: value for key, value in values.items() if value is not None}
    )


@mcp.tool(annotations=READ, structured_output=True)
async def list_tabs(
    group: str | None = None,
    unassignedOnly: bool = False,
    category: str | None = None,
    tags: str = "",
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TabListViewDTO:
    """List active visible Saved Tabs using public Group selectors."""
    groups = await group_utils.visible_groups()
    group_id = group_utils.resolve_scope(groups, group, unassignedOnly)
    response = await get_client().list_tabs(
        TabListQueryDTO(
            group_id=group_id,
            category=category,
            tags=tags,
            search=search,
            limit=limit,
            offset=offset,
            fields="full",
            visibility="visible",
        )
    )
    return mapper.to_page(response, groups)


@mcp.tool(annotations=READ, structured_output=True)
async def search_tabs(
    query: str,
    mode: SearchMode = "hybrid",
    limit: int = 10,
    group: str | None = None,
    unassignedOnly: bool = False,
) -> SearchResponseViewDTO:
    """Search visible Saved Tabs using an optional public Group selector."""
    groups = await group_utils.visible_groups()
    group_id = group_utils.resolve_scope(groups, group, unassignedOnly)
    response = await get_client().search_tabs(
        SearchQueryDTO(
            q=query,
            mode=mode,
            limit=50 if unassignedOnly else limit,
            group_id=None if group_id == "all" else group_id,
        )
    )
    if unassignedOnly:
        # ponytail: backend search cannot filter null membership; add API support if top-50 truncation
        # becomes observable.
        response = response.model_copy(
            update={
                "data": SearchDataDTO(
                    results=[item for item in response.data.results if item.tab.group_id is None][
                        :limit
                    ]
                )
            }
        )
    return mapper.to_search(response, groups)


@mcp.tool(annotations=READ, structured_output=True)
async def get_tab(url: str) -> TabResponseViewDTO:
    """Read the oldest active visible Saved Tab with one exact stored URL."""
    tab = await utils.first_visible_tab(url)
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=mapper.to_view(tab, groups))


@mcp.tool(annotations=WRITE, structured_output=True)
async def save_tab(
    url: str,
    title: str | None = None,
    note: str = "",
    agentReview: str = "",
    viewed: bool = False,
    tags: list[str] | None = None,
    group: str | None = None,
) -> TabResponseViewDTO:
    """Save one occurrence into an optional Group selected by name."""
    groups = await group_utils.visible_groups()
    group_id = None if group is None else group_utils.group_named(groups, group).id
    response = await get_client().create_tab(
        TabCreateDTO(
            url=url,
            title=title,
            note=note,
            agent_review=agentReview,
            viewed=viewed,
            tags=tags or [],
            group_id=group_id,
        )
    )
    return TabResponseViewDTO(data=mapper.to_view(response.data, groups))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def update_tab(
    url: str,
    newUrl: str | None = None,
    title: str | None = None,
    note: str | None = None,
    agentReview: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    hiddenUntil: str | None = None,
) -> TabResponseViewDTO:
    """Update only the oldest active visible exact-URL match."""
    tab = await utils.first_visible_tab(url)
    response = await get_client().update_tab(
        tab.id,
        _update_dto(
            new_url=newUrl,
            title=title,
            note=note,
            agent_review=agentReview,
            viewed=viewed,
            tags=tags,
            hidden_until=hiddenUntil,
        ),
    )
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=mapper.to_view(response.data, groups))


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
async def delete_tab(url: str) -> TabDeleteResponseViewDTO:
    """Archive only the oldest active visible exact-URL match."""
    tab = await utils.first_visible_tab(url)
    response = await get_client().delete_tab(tab.id)
    return TabDeleteResponseViewDTO(
        data=TabDeleteViewDTO(
            url=tab.url,
            deleted_at=response.data.deleted_at,
            hard=response.data.hard,
        )
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def move_tab(url: str, targetGroup: str | None = None) -> TabResponseViewDTO:
    """Move only the oldest visible exact-URL match into a named Group or Unassigned."""
    tab = await utils.first_visible_tab(url)
    groups = await group_utils.visible_groups()
    group_id = None if targetGroup is None else group_utils.group_named(groups, targetGroup).id
    response = await get_client().update_tab(
        tab.id, TabUpdateDTO.model_validate({"group_id": group_id})
    )
    return TabResponseViewDTO(data=mapper.to_view(response.data, groups))
