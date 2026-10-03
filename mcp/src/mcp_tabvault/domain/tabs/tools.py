"""Register URL-addressed MCP tools for Saved Tab operations."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field

from mcp_tabvault.client import get_client
from mcp_tabvault.client.dto import (
    PropertyDefinitionDTO,
    PropertySchemaResponseDTO,
    SearchDataDTO,
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
    TabChangesDTO,
    TabDeleteResponseViewDTO,
    TabDeleteViewDTO,
    TabListViewDTO,
    TabResponseViewDTO,
)


def _update_dto(changes: TabChangesDTO) -> TabUpdateDTO:
    """Convert supplied MCP changes to the nested HTTP patch contract.

    Args:
        changes (TabChangesDTO): Editable values; null values are omitted.

    Returns:
        TabUpdateDTO: Patch preserving empty strings, false, and empty tag lists.
    """
    values = changes.model_dump(exclude_none=True)
    groups: dict[str, dict[str, object]] = {}
    for field, value in values.items():
        if field in {"new_url", "title"}:
            group = "content"
        elif field == "hidden_until":
            group = "lifecycle"
        else:
            group = "annotations"
        groups.setdefault(group, {})["url" if field == "new_url" else field] = value
    return TabUpdateDTO.model_validate(groups)


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
        TabListQueryDTO.model_validate(
            {
                "fields": "full",
                "filters": {
                    "group_id": group_id,
                    "category": category,
                    "tags": tags,
                    "search": search,
                    "visibility": "visible",
                },
                "pagination": {"limit": limit, "offset": offset},
            }
        )
    )
    return mapper.to_page(response, groups)


@mcp.tool(title="Search Saved Tabs", annotations=READ, structured_output=True)
async def search_tabs(
    query: Annotated[
        str, Field(min_length=1, description="Nonempty search text for saved metadata.")
    ],
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
    """Search active visible Saved Tabs by text.

    Group and unassignedOnly cannot be combined. Unassigned search filters the top 50 global
    results and may return fewer matches.

    Args:
        query (str): Nonempty search text for saved metadata.
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
                    results=[
                        item
                        for item in response.data.results
                        if item.tab.placement.group_id is None
                    ][:limit]
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
    annotations=WRITE,
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
    customProperties: Annotated[
        dict[str, Any] | None,
        Field(
            description="Explicit custom-property values. note and agentReview string definitions are created when needed; arbitrary names require a definition first."
        ),
    ] = None,
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
    """Create a new Saved Tab occurrence with explicit custom properties.

    Repeated URLs retain separate identities. No Group means Unassigned.

    Args:
        url (str): Absolute HTTP or HTTPS URL to save unchanged; repeated URLs create separate
            occurrences.
        title (str | None): Optional saved title; null lets the API choose the title.
        customProperties (dict[str, Any] | None): Explicit overrides; missing note, agentReview,
            and viewed conventions are declared on demand without replacing existing definitions.
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
        TabCreateDTO.model_validate(
            {
                "content": {"url": url, "title": title},
                "annotations": {
                    "custom_properties": customProperties or {},
                    "tags": tags or [],
                },
                "placement": {"group_id": group_id},
            }
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
    changes: Annotated[
        TabChangesDTO,
        Field(description="Fields to update; omitted or null values remain unchanged."),
    ],
) -> TabResponseViewDTO:
    """Update the oldest active visible exact-URL match using grouped changes.

    An empty tags list removes tags. Custom properties retain explicit overrides.
    Changing URL or hiding the record can make a repeated call select another occurrence.

    Args:
        url (str): Original Saved Tab URL selecting the oldest accessible match.
        changes (TabChangesDTO): Replacement fields; omitted or null values stay unchanged.

    Returns:
        TabResponseViewDTO: ID-free updated Saved Tab.

    Raises:
        MCPClientError: API access fails or the selected record is inaccessible.
        ValueError: Supplied fields fail validation.
    """
    tab = await utils.first_visible_tab(url)
    response = await get_client().update_tab(tab.id, _update_dto(changes))
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
            url=tab.content.url,
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
        tab.id, TabUpdateDTO.model_validate({"placement": {"group_id": group_id}})
    )
    return TabResponseViewDTO(data=mapper.to_view(response.data, groups))


@mcp.tool(title="Read Custom Property Schema", annotations=READ, structured_output=True)
async def property_schema() -> PropertySchemaResponseDTO:
    """Read available definitions without creating client conventions.

    Returns:
        PropertySchemaResponseDTO: Current schema.
    """
    return await get_client().property_schema()


@mcp.tool(title="Define Custom Property", annotations=IDEMPOTENT_WRITE, structured_output=True)
async def define_property(
    definition: Annotated[
        PropertyDefinitionDTO,
        Field(description="Property name, type, default, and description to define."),
    ],
) -> PropertySchemaResponseDTO:
    """Explicitly define a property without changing existing raw values.

    Args:
        definition (PropertyDefinitionDTO): Validated name, type, default, and description.

    Returns:
        PropertySchemaResponseDTO: Updated schema.
    """
    return await get_client().upsert_property(definition)


@mcp.tool(
    title="Delete Custom Property Definition", annotations=DESTRUCTIVE, structured_output=True
)
async def delete_property(
    name: Annotated[
        str,
        Field(min_length=1, max_length=128, description="Case-sensitive property name to remove."),
    ],
) -> PropertySchemaResponseDTO:
    """Remove one definition while retaining raw tab overrides.

    Args:
        name (str): Case-sensitive property identity.

    Returns:
        PropertySchemaResponseDTO: Updated schema.
    """
    return await get_client().delete_property(name)


@mcp.tool(title="Unset Saved Tab Properties", annotations=IDEMPOTENT_WRITE, structured_output=True)
async def unset_properties(
    url: Annotated[
        str, Field(min_length=1, description="Exact saved HTTP(S) URL of a visible occurrence.")
    ],
    properties: Annotated[
        list[str],
        Field(
            min_length=1, description="Property names whose explicit overrides should be removed."
        ),
    ],
) -> TabResponseViewDTO:
    """Unset overrides on the oldest visible exact-URL occurrence.

    Args:
        url (str): Exact saved URL restricted to visible active records.
        properties (list[str]): Names to remove from raw overrides.

    Returns:
        TabResponseViewDTO: Updated record without exposing internal IDs.
    """
    tab = await utils.first_visible_tab(url)
    response = await get_client().unset_properties(tab.id, properties)
    return TabResponseViewDTO(
        data=mapper.to_view(response.data, await group_utils.visible_groups())
    )
