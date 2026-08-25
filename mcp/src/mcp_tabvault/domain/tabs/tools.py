"""Register top-level asynchronous MCP tools for Saved Tab operations."""

from __future__ import annotations

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import (
    SearchMode,
    SearchQueryDTO,
    SearchResponseDTO,
    TabByUrlResultDTO,
    TabCreateDTO,
    TabCreateResponseDTO,
    TabDeleteResponseDTO,
    TabDTO,
    TabListQueryDTO,
    TabListResponseDTO,
    TabReorderDTO,
    TabReorderResponseDTO,
    TabResponseDTO,
    TabsByUrlResultDTO,
    TabTagDTO,
    TabUpdateDTO,
    UrlBulkResultDTO,
)
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.server import DESTRUCTIVE, IDEMPOTENT_WRITE, READ, WRITE, mcp

from . import utils


def _update_dto(
    *,
    url: str | None = None,
    title: str | None = None,
    note: str | None = None,
    agent_review: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    position: float | None = None,
    hidden_until: str | None = None,
) -> TabUpdateDTO:
    """Build a DTO containing only fields explicitly supplied to an MCP update."""
    values: dict[str, object | None] = {
        "url": url,
        "title": title,
        "note": note,
        "agent_review": agent_review,
        "viewed": viewed,
        "tags": tags,
        "position": position,
        "hidden_until": hidden_until,
    }
    return TabUpdateDTO.model_validate(
        {key: value for key, value in values.items() if value is not None}
    )


@mcp.tool(annotations=READ, structured_output=True)
async def list_tabs(
    groupId: str = "all",
    category: str | None = None,
    tags: str = "",
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    fields: str = "full",
) -> TabListResponseDTO:
    """List active visible Saved Tabs using ordinary API filters."""
    return await get_client().list_tabs(
        TabListQueryDTO(
            group_id=groupId,
            category=category,
            tags=tags,
            search=search,
            limit=limit,
            offset=offset,
            fields=fields,
            visibility="visible",
        )
    )


@mcp.tool(annotations=READ, structured_output=True)
async def search_tabs(
    query: str,
    mode: SearchMode = "hybrid",
    limit: int = 10,
    groupId: str | None = None,
) -> SearchResponseDTO:
    """Search Saved Tabs by meaning and text."""
    return await get_client().search_tabs(
        SearchQueryDTO(q=query, mode=mode, limit=limit, group_id=groupId)
    )


@mcp.tool(annotations=READ, structured_output=True)
async def get_tab(id: str) -> TabResponseDTO:
    """Read one active visible Saved Tab."""
    return await get_client().get_tab(id)


@mcp.tool(annotations=WRITE, structured_output=True)
async def save_tab(
    url: str,
    title: str | None = None,
    note: str = "",
    agentReview: str = "",
    viewed: bool = False,
    tags: list[str] | None = None,
    groupId: str | None = None,
) -> TabCreateResponseDTO:
    """Save exactly one active occurrence with optional metadata."""
    return await get_client().create_tab(
        TabCreateDTO(
            url=url,
            title=title,
            note=note,
            agent_review=agentReview,
            viewed=viewed,
            tags=tags or [],
            group_id=groupId,
        )
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def update_tab(
    id: str,
    url: str | None = None,
    title: str | None = None,
    note: str | None = None,
    agentReview: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    position: float | None = None,
    hiddenUntil: str | None = None,
) -> TabResponseDTO:
    """Update supplied fields on one active visible Saved Tab."""
    return await get_client().update_tab(
        id,
        _update_dto(
            url=url,
            title=title,
            note=note,
            agent_review=agentReview,
            viewed=viewed,
            tags=tags,
            position=position,
            hidden_until=hiddenUntil,
        ),
    )


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
async def delete_tab(id: str) -> TabDeleteResponseDTO:
    """Archive and Unassign one active visible Saved Tab."""
    return await get_client().delete_tab(id)


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def move_tab(
    id: str, targetGroupId: str | None = None, position: int | None = None
) -> TabResponseDTO:
    """Move one active visible Saved Tab into a Group or Unassigned."""
    values: dict[str, object | None] = {"group_id": targetGroupId}
    if position is not None:
        values["position"] = position
    return await get_client().update_tab(id, TabUpdateDTO.model_validate(values))


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def reorder_tabs(tabIds: list[str], groupId: str | None = None) -> TabReorderResponseDTO:
    """Apply one relative order to visible Saved Tabs in a membership scope."""
    return await get_client().reorder_tabs(TabReorderDTO(tab_ids=tabIds, group_id=groupId))


@mcp.tool(annotations=READ, structured_output=True)
async def get_tab_by_url(url: str) -> TabByUrlResultDTO:
    """Return the first active visible Saved Tab with an exact stored URL."""
    matches = await utils.matching_tabs(url)
    result = matches[0] if matches else None
    return TabByUrlResultDTO(result=result)


@mcp.tool(annotations=READ, structured_output=True)
async def list_tabs_by_url(url: str) -> TabsByUrlResultDTO:
    """List every active visible Saved Tab with an exact stored URL."""
    matches = await utils.matching_tabs(url)
    return TabsByUrlResultDTO(result=matches)


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def update_tabs_by_url(
    url: str,
    newUrl: str | None = None,
    title: str | None = None,
    note: str | None = None,
    agentReview: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    position: float | None = None,
    hiddenUntil: str | None = None,
    targetGroupId: str | None = None,
) -> UrlBulkResultDTO:
    """Best-effort update every active visible exact URL match."""
    destination = None if targetGroupId == "unassigned" else targetGroupId
    if targetGroupId is not None and destination is not None:
        await group_utils.require_visible_group(destination)
    body = _update_dto(
        url=newUrl,
        title=title,
        note=note,
        agent_review=agentReview,
        viewed=viewed,
        tags=tags,
        position=position,
        hidden_until=hiddenUntil,
    )
    if not body.model_fields_set and targetGroupId is None:
        raise ValueError("At least one tab field or targetGroupId is required")

    client = get_client()
    matching = await utils.matching_tabs(url)

    async def update_one(tab: TabDTO) -> TabResponseDTO:
        tab_body = body
        if targetGroupId is not None:
            tab_body = body.model_copy(update={"group_id": destination})
        return await client.update_tab(tab.id, tab_body)

    return await utils.best_effort(matching, update_one)


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def tag_tabs_by_url(url: str, tagName: str) -> UrlBulkResultDTO:
    """Best-effort attach one tag to every active visible exact URL match."""
    client = get_client()
    matching = await utils.matching_tabs(url)

    async def tag_one(tab: TabDTO) -> TabResponseDTO:
        return await client.tag_tab(tab.id, TabTagDTO(tag_name=tagName))

    return await utils.best_effort(matching, tag_one)


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
async def untag_tabs_by_url(url: str, tagName: str) -> UrlBulkResultDTO:
    """Best-effort detach one tag from every active visible exact URL match."""
    client = get_client()
    matching = await utils.matching_tabs(url)

    async def untag_one(tab: TabDTO) -> TabResponseDTO:
        return await client.untag_tab(tab.id, tagName)

    return await utils.best_effort(matching, untag_one)
