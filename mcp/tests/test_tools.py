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
        if "tabs" in path:
            if method == "GET" and path == "tabs":
                return tab_page
            elif method == "GET" and path == "search":
                return search_response
            elif method == "GET" and "tabs/" in path:
                return tab_response
            elif method == "POST" and path == "tabs":
                return created
            elif method == "PATCH" and "tabs/" in path:
                return tab_response
            elif method == "DELETE" and "tabs/" in path:
                return deleted
            elif method == "PUT" and path == "order":
                return reordered
        elif "groups" in path:
            if method == "GET" and path == "groups":
                return group_page
            elif method == "POST" and path == "groups" or method == "PATCH" and "groups/" in path:
                return group_response
            elif method == "DELETE" and "groups/" in path:
                return group_deleted
        elif "tags" in path:
            if method == "GET" and path == "tags":
                return tag_page
            elif (
                method == "POST"
                and "tabs/" in path
                and "tags" in path
                or method == "DELETE"
                and "tags/" in path
            ):
                return tab_response
        raise RuntimeError(f"Unexpected request: {method} {path}")

    mock_client._request = mock_request

    monkeypatch.setattr("mcp_tabvault.client.get_client", lambda: mock_client)

    await tab_tools.list_tabs(groupId="unassigned")
    await tab_tools.search_tabs("query", groupId="group")
    await tab_tools.get_tab("tab")
    await tab_tools.save_tab("https://example.com", agentReview="summary", groupId="group")
    await tab_tools.update_tab("tab", title="Changed", hiddenUntil="2030-01-01T00:00:00Z")
    await tab_tools.delete_tab("tab")
    await tab_tools.move_tab("tab", targetGroupId="group", position=1)
    await tab_tools.reorder_tabs(["tab"], groupId="group")

    for call in requests_made:
        if call[0] == "GET" and call[1] == "tabs":
            from mcp_tabvault.client.dto import TabListQueryDTO

            TabListQueryDTO(group_id="unassigned")
            break

    await tab_tools.move_tab("tab")

    group_tools.create_group("Group", description="Context", color="#fff")
    group_tools.update_group("group", description="Updated", position=1)

    tag_tools.list_tags()
    tag_tools.tag_tab("tab", "docs")
    tag_tools.untag_tab("tab", "docs")
