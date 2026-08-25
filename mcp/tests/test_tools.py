from __future__ import annotations

import pytest
from factories import NOW, group, tab, tag

from mcp_tabvault.client import MCPClient
from mcp_tabvault.client.dto import (
    GroupDeleteResponseDTO,
    GroupDeleteResultDTO,
    GroupListResponseDTO,
    GroupResponseDTO,
    SearchDataDTO,
    SearchMetaDTO,
    SearchResponseDTO,
    TabCreateMetaDTO,
    TabCreateResponseDTO,
    TabDeleteResponseDTO,
    TabDeleteResultDTO,
    TabJobDTO,
    TabListResponseDTO,
    TabReorderResponseDTO,
    TabReorderResultDTO,
    TabResponseDTO,
    TagListResponseDTO,
)
from mcp_tabvault.domain.groups import tools as group_tools
from mcp_tabvault.domain.tabs import tools as tab_tools
from mcp_tabvault.domain.tags import tools as tag_tools


@pytest.mark.anyio
async def test_every_tool_builds_typed_inputs_and_returns_dtos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that all tools build proper typed inputs and return appropriate DTOs."""
    tab_page = TabListResponseDTO(data=[tab()])
    search_response = SearchResponseDTO(
        data=SearchDataDTO(results=[]), meta=SearchMetaDTO(query_embedding_ms=1, search_ms=2)
    )
    created = TabCreateResponseDTO(
        data=tab(), meta=TabCreateMetaDTO(job=TabJobDTO(tab_id="tab", job_id="job"))
    )
    tab_response = TabResponseDTO(data=tab())
    deleted = TabDeleteResponseDTO(data=TabDeleteResultDTO(id="tab", deleted_at=NOW, hard=False))
    reordered = TabReorderResponseDTO(data=TabReorderResultDTO(group_id="group", tab_ids=["tab"]))
    group_page = GroupListResponseDTO(data=[group()])
    group_response = GroupResponseDTO(data=group())
    group_deleted = GroupDeleteResponseDTO(
        data=GroupDeleteResultDTO(id="group", archived_tab_count=0, deleted_at=NOW)
    )
    tag_page = TagListResponseDTO(data=[tag()])

    mock_client = MCPClient("http://test")

    requests_made: list[tuple[str, object]] = []

    async def mock_request(method: str, path: str, response_type: type, body=None, query=None):
        requests_made.append((method, path))
        if method == "GET" and path == "/tabs":
            return tab_page
        if method == "GET" and path == "/search":
            return search_response
        if method == "GET" and path == "/tabs/tab":
            return tab_response
        if method == "POST" and path == "/tabs":
            return created
        if method == "PATCH" and path == "/tabs/tab":
            return tab_response
        if method == "DELETE" and path == "/tabs/tab":
            return deleted
        if method == "PUT" and path == "/tabs/order":
            return reordered
        if method == "GET" and path == "/groups":
            return group_page
        if method == "GET" and path == "/groups/group/tabs":
            return TabListResponseDTO(data=[])
        if method in {"POST", "PATCH"} and path in {"/groups", "/groups/group"}:
            return group_response
        if method == "DELETE" and path == "/groups/group":
            return group_deleted
        if method == "GET" and path == "/tags":
            return tag_page
        if method == "POST" and path == "/tabs/tab/tags":
            return tab_response
        if method == "DELETE" and path == "/tabs/tab/tags/docs":
            return tab_response
        raise RuntimeError(f"Unexpected request: {method} {path}")

    mock_client._request = mock_request

    monkeypatch.setattr(tab_tools, "get_client", lambda: mock_client)
    monkeypatch.setattr(tab_tools.utils, "get_client", lambda: mock_client)
    monkeypatch.setattr(group_tools, "get_client", lambda: mock_client)
    monkeypatch.setattr(group_tools.utils, "get_client", lambda: mock_client)
    monkeypatch.setattr(tag_tools, "get_client", lambda: mock_client)

    await tab_tools.list_tabs(groupId="unassigned")
    await tab_tools.search_tabs("query", groupId="group")
    await tab_tools.get_tab("tab")
    await tab_tools.save_tab("https://example.com", agentReview="summary", groupId="group")
    await tab_tools.update_tab("tab", title="Changed", hiddenUntil="2030-01-01T00:00:00Z")
    await tab_tools.delete_tab("tab")
    await tab_tools.move_tab("tab", targetGroupId="group", position=1)
    await tab_tools.reorder_tabs(["tab"], groupId="group")

    for call in requests_made:
        if call[0] == "GET" and call[1] == "/tabs":
            from mcp_tabvault.client.dto import TabListQueryDTO

            TabListQueryDTO(group_id="unassigned")
            break

    await tab_tools.move_tab("tab")

    await tab_tools.get_tab_by_url("https://exact")
    await tab_tools.list_tabs_by_url("https://exact")
    await tab_tools.update_tabs_by_url("https://exact", targetGroupId="unassigned")
    await tab_tools.tag_tabs_by_url("https://exact", "docs")
    await tab_tools.untag_tabs_by_url("https://exact", "docs")

    await group_tools.list_groups()
    await group_tools.create_group("Group", description="Context", color="#fff")
    await group_tools.update_group("group", description="Updated", position=1)
    await group_tools.delete_group("group")

    await tag_tools.list_tags()
    await tag_tools.tag_tab("tab", "docs")
    await tag_tools.untag_tab("tab", "docs")
    await mock_client.aclose()
