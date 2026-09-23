from __future__ import annotations

import pytest
from factories import group, tab, tag

from mcp_tabvault import main
from mcp_tabvault.client import MCPClient
from mcp_tabvault.client.dto import GroupListResponseDTO, TabListResponseDTO, TagListResponseDTO
from mcp_tabvault.domain.groups import prompts as group_prompts
from mcp_tabvault.domain.groups import resources as group_resources
from mcp_tabvault.domain.tabs import prompts as tab_prompts
from mcp_tabvault.domain.tabs import resources as tab_resources
from mcp_tabvault.domain.tags import resources as tag_resources


@pytest.mark.anyio
async def test_resources_are_registered_without_id_selectors() -> None:
    resources = await main.mcp.list_resources()
    templates = await main.mcp.list_resource_templates()

    assert {str(resource.uri) for resource in resources} == {
        "tabvault://groups",
        "tabvault://tags",
    }
    assert {template.uri_template for template in templates} == {
        "tabvault://recent{?limit}",
        "tabvault://unassigned{?limit}",
        "tabvault://tabs{?url}",
    }


@pytest.mark.anyio
async def test_resources_return_id_free_views(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MCPClient("http://test")
    queries: list[object] = []

    async def list_groups(query):
        queries.append(query)
        return GroupListResponseDTO(data=[group()])

    async def list_tags(query):
        queries.append(query)
        return TagListResponseDTO(data=[tag()])

    async def list_tabs(query):
        queries.append(query)
        return TabListResponseDTO(data=[tab()])

    async def first_tab(_url: str):
        return tab()

    monkeypatch.setattr(client, "list_groups", list_groups)
    monkeypatch.setattr(client, "list_tags", list_tags)
    monkeypatch.setattr(client, "list_tabs", list_tabs)
    monkeypatch.setattr(group_resources, "get_client", lambda: client)
    monkeypatch.setattr(tab_resources, "get_client", lambda: client)
    monkeypatch.setattr(tag_resources, "get_client", lambda: client)
    monkeypatch.setattr(tab_resources.group_utils, "visible_groups", lambda: list_groups(None))
    monkeypatch.setattr(tab_resources.utils, "first_visible_tab", first_tab)

    group_view = (await group_resources.groups()).data[0]
    tag_view = (await tag_resources.tags()).data[0]
    recent = (await tab_resources.recent_tabs(12)).data[0]
    unassigned = (await tab_resources.unassigned_tabs(8)).data[0]
    single = (await tab_resources.saved_tab("https://exact")).data

    assert group_view.name == "Group"
    assert tag_view.name == "docs"
    assert recent.group is None and unassigned.group is None and single.url == "https://exact"
    assert "id" not in group_view.model_dump(mode="json", by_alias=True)
    for view in (recent, unassigned, single):
        payload = view.model_dump(mode="json", by_alias=True)
        assert not ({"id", "groupId", "position"} & set(payload))
    assert any(getattr(query, "fields", None) == "full" for query in queries)
    await client.aclose()


@pytest.mark.anyio
async def test_prompts_are_registered_and_require_approval_before_mutation() -> None:
    prompts = await main.mcp.list_prompts()
    assert {prompt.name for prompt in prompts} == {
        "organize_unassigned",
        "research_digest",
        "weekly_tab_review",
    }
    assert "explicitly approve" in tab_prompts.organize_unassigned(10)
    assert "Do not change" in group_prompts.research_digest("Research")
    assert "outside" in tab_prompts.weekly_tab_review()
