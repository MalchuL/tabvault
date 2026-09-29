"""Register URL-addressed MCP tools for Saved Tab operations."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

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


@mcp.tool(title="List Saved Tabs", annotations=READ, structured_output=True)
async def list_tabs(
    group: Annotated[
        str | None,
        Field(
            description="Visible Group name, matched exactly ignoring case; oldest match wins. Null omits the filter."
        ),
    ] = None,
    unassignedOnly: Annotated[
        bool, Field(description="Only tabs without a Group; cannot be combined with group.")
    ] = False,
    category: Annotated[
        str | None, Field(description="Filter by Group category; null disables this filter.")
    ] = None,
    tags: Annotated[
        str,
        Field(
            description="Comma-separated tag names; match at least one. Empty string disables this filter."
        ),
    ] = "",
    search: Annotated[
        str | None, Field(description="Text filter for saved metadata; null disables this filter.")
    ] = None,
    limit: Annotated[
        int, Field(ge=1, le=100, description="Maximum records per page, from 1 to 100.")
    ] = 50,
    offset: Annotated[
        int,
        Field(
            ge=0, description="Records to skip; advance by the returned size while hasNext is true."
        ),
    ] = 0,
) -> TabListViewDTO:
    """List active visible Saved Tabs, optionally filtered by Group, tags, or text.

    Group and unassignedOnly cannot be combined. Returns one page; use offset when hasNext is
    true.

    Args:
        group (str | None): Visible Group name, matched exactly ignoring case; oldest match
            wins. Null omits the filter.
        unassignedOnly (bool): Only tabs without a Group; cannot be combined with group.
        category (str | None): Filter by Group category; null disables this filter.
        tags (str): Comma-separated tag names; match at least one. Empty string disables this
            filter.
        search (str | None): Text filter for saved metadata; null disables this filter.
        limit (int): Maximum records per page, from 1 to 100.
        offset (int): Records to skip; advance by the returned size while hasNext is true.

    Returns:
        TabListViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Group and unassignedOnly are both supplied, or fields are invalid.
    """
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


@mcp.tool(title="Search Saved Tabs", annotations=READ, structured_output=True)
async def search_tabs(
    query: Annotated[
        str, Field(min_length=1, description="Nonempty search text for saved metadata.")
    ],
    mode: Annotated[
        SearchMode,
        Field(
            description="hybrid combines semantic and keyword matching; semantic uses meaning; keyword uses text."
        ),
    ] = "hybrid",
    limit: Annotated[
        int, Field(ge=1, le=50, description="Maximum search results, from 1 to 50.")
    ] = 10,
    group: Annotated[
        str | None,
        Field(
            description="Visible Group name, matched exactly ignoring case; oldest match wins. Null omits the filter."
        ),
    ] = None,
    unassignedOnly: Annotated[
        bool,
        Field(
            description="Only Unassigned matches among the top 50 global results; incompatible with group."
        ),
    ] = False,
) -> SearchResponseViewDTO:
    """Search active visible Saved Tabs by meaning, keywords, or both.

    Group and unassignedOnly cannot be combined. Unassigned search filters the top 50 global
    results and may return fewer matches.

    Args:
        query (str): Nonempty search text for saved metadata.
        mode (SearchMode): hybrid combines semantic and keyword matching; semantic uses meaning;
            keyword uses text.
        limit (int): Maximum search results, from 1 to 50.
        group (str | None): Visible Group name, matched exactly ignoring case; oldest match
            wins. Null omits the filter.
        unassignedOnly (bool): Only Unassigned matches among the top 50 global results;
            incompatible with group.

    Returns:
        SearchResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Group and unassignedOnly are both supplied, or fields are invalid.
    """
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


@mcp.tool(title="Read Saved Tab", annotations=READ, structured_output=True)
async def get_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Exact original Saved Tab URL; selects the oldest active visible match.",
        ),
    ],
) -> TabResponseViewDTO:
    """Read the oldest active visible Saved Tab with one exact original URL.

    Repeated URLs are separate occurrences; this selector cannot address every occurrence
    independently.

    Args:
        url (str): Exact original Saved Tab URL; selects the oldest active visible match.

    Returns:
        TabResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: The exact URL is blank.
    """
    tab = await utils.first_visible_tab(url)
    groups = await group_utils.visible_groups()
    return TabResponseViewDTO(data=mapper.to_view(tab, groups))


@mcp.tool(
    title="Save Tab",
    annotations=WRITE.model_copy(update={"open_world_hint": True}),
    structured_output=True,
)
async def save_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Absolute HTTP or HTTPS URL to save unchanged; repeated URLs create separate occurrences.",
        ),
    ],
    title: Annotated[
        str | None,
        Field(
            max_length=1024, description="Optional saved title; null lets the API choose the title."
        ),
    ] = None,
    note: Annotated[
        str, Field(max_length=20000, description="Saved note; empty string stores no note.")
    ] = "",
    agentReview: Annotated[
        str,
        Field(
            max_length=20000,
            description="Agent-written review stored separately from the user note.",
        ),
    ] = "",
    viewed: Annotated[
        bool, Field(description="Whether this occurrence has been viewed; defaults to false.")
    ] = False,
    tags: Annotated[
        list[str] | None,
        Field(max_length=64, description="Up to 64 tag names; omitted or null means no tags."),
    ] = None,
    group: Annotated[
        str | None,
        Field(
            description="Exact visible Group name, ignoring case; oldest match wins. Null saves to Unassigned."
        ),
    ] = None,
) -> TabResponseViewDTO:
    """Create a new Saved Tab occurrence and queue a preview capture.

    Never deduplicates URLs. The API may fetch the URL for its preview. No Group means
    Unassigned.

    Args:
        url (str): Absolute HTTP or HTTPS URL to save unchanged; repeated URLs create separate
            occurrences.
        title (str | None): Optional saved title; null lets the API choose the title.
        note (str): Saved note; empty string stores no note.
        agentReview (str): Agent-written review stored separately from the user note.
        viewed (bool): Whether this occurrence has been viewed; defaults to false.
        tags (list[str] | None): Up to 64 tag names; omitted or null means no tags.
        group (str | None): Exact visible Group name, ignoring case; oldest match wins. Null
            saves to Unassigned.

    Returns:
        TabResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Supplied fields fail request validation.
    """
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


@mcp.tool(title="Update Saved Tab", annotations=DESTRUCTIVE, structured_output=True)
async def update_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Exact original Saved Tab URL; selects the oldest active visible match.",
        ),
    ],
    newUrl: Annotated[
        str | None,
        Field(
            min_length=1,
            max_length=4096,
            description="Replacement absolute HTTP or HTTPS URL; omitted or null leaves it unchanged.",
        ),
    ] = None,
    title: Annotated[
        str | None,
        Field(
            min_length=1,
            max_length=1024,
            description="Replacement nonempty title; omitted or null leaves it unchanged.",
        ),
    ] = None,
    note: Annotated[
        str | None,
        Field(
            max_length=20000,
            description="Replacement note; empty string clears it; null leaves it unchanged.",
        ),
    ] = None,
    agentReview: Annotated[
        str | None,
        Field(
            max_length=20000,
            description="Replacement agent review; empty string clears it; null leaves it unchanged.",
        ),
    ] = None,
    viewed: Annotated[
        bool | None,
        Field(description="Replacement viewed state; omitted or null leaves it unchanged."),
    ] = None,
    tags: Annotated[
        list[str] | None,
        Field(
            max_length=64,
            description="Replace all tags with up to 64 names; [] clears tags; null leaves them unchanged.",
        ),
    ] = None,
    hiddenUntil: Annotated[
        str | None,
        Field(
            description="ISO 8601 datetime visibility deadline; future dates hide the tab. Null leaves it unchanged."
        ),
    ] = None,
) -> TabResponseViewDTO:
    """Update supplied fields on the oldest active visible exact-URL match.

    Omitted or null fields stay unchanged. Empty note or review clears it; an empty tag list
    removes all tags. Changing URL or hiding the tab can make retries select a different
    duplicate.

    Args:
        url (str): Exact original Saved Tab URL; selects the oldest active visible match.
        newUrl (str | None): Replacement absolute HTTP or HTTPS URL; omitted or null leaves it
            unchanged.
        title (str | None): Replacement nonempty title; omitted or null leaves it unchanged.
        note (str | None): Replacement note; empty string clears it; null leaves it unchanged.
        agentReview (str | None): Replacement agent review; empty string clears it; null leaves
            it unchanged.
        viewed (bool | None): Replacement viewed state; omitted or null leaves it unchanged.
        tags (list[str] | None): Replace all tags with up to 64 names; [] clears tags; null
            leaves them unchanged.
        hiddenUntil (str | None): ISO 8601 datetime visibility deadline; future dates hide the
            tab. Null leaves it unchanged.

    Returns:
        TabResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: Supplied fields fail request validation.
    """
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


@mcp.tool(title="Archive Saved Tab", annotations=DESTRUCTIVE, structured_output=True)
async def delete_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Exact original Saved Tab URL; selects the oldest active visible match.",
        ),
    ],
) -> TabDeleteResponseViewDTO:
    """Archive the oldest active visible exact-URL match.

    Uses recoverable archiving, not permanent deletion. Retrying can archive the next duplicate
    occurrence.

    Args:
        url (str): Exact original Saved Tab URL; selects the oldest active visible match.

    Returns:
        TabDeleteResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: The exact URL is blank.
    """
    tab = await utils.first_visible_tab(url)
    response = await get_client().delete_tab(tab.id)
    return TabDeleteResponseViewDTO(
        data=TabDeleteViewDTO(
            url=tab.url,
            deleted_at=response.data.deleted_at,
            hard=response.data.hard,
        )
    )


@mcp.tool(title="Move Saved Tab", annotations=IDEMPOTENT_WRITE, structured_output=True)
async def move_tab(
    url: Annotated[
        str,
        Field(
            min_length=1,
            max_length=4096,
            description="Exact original Saved Tab URL; selects the oldest active visible match.",
        ),
    ],
    targetGroup: Annotated[
        str | None,
        Field(
            description="Destination visible Group name, ignoring case; oldest match wins. Null moves to Unassigned."
        ),
    ] = None,
) -> TabResponseViewDTO:
    """Move the oldest active visible exact-URL match to a Group or Unassigned.

    Only one save occurrence moves; repeated URLs are not independently selectable.

    Args:
        url (str): Exact original Saved Tab URL; selects the oldest active visible match.
        targetGroup (str | None): Destination visible Group name, ignoring case; oldest match
            wins. Null moves to Unassigned.

    Returns:
        TabResponseViewDTO: ID-free library result with applicable metadata.

    Raises:
        MCPClientError: API access fails or a selected record is inaccessible.
        ValueError: The exact URL is blank.
    """
    tab = await utils.first_visible_tab(url)
    groups = await group_utils.visible_groups()
    group_id = None if targetGroup is None else group_utils.group_named(groups, targetGroup).id
    response = await get_client().update_tab(
        tab.id, TabUpdateDTO.model_validate({"group_id": group_id})
    )
    return TabResponseViewDTO(data=mapper.to_view(response.data, groups))
