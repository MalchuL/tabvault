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


@pytest.mark.anyio
async def test_context_through_mcp_client(monkeypatch: pytest.MonkeyPatch) -> None:
    import json
    from urllib.parse import urlencode

    import httpx
    from mcp import Client
    from mcp.shared.exceptions import MCPError

    seen: list[httpx.Request] = []
    original_url = "https://example.com/a/b?q=one&next=two#anchor"
    fail = False

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.method == "GET"
        assert request.headers["X-API-Key"] == "secret"
        assert request.url.path != "/api/v1/property-schema"
        if fail:
            return httpx.Response(503, text="offline")
        path = request.url.path
        if path == "/api/v1/groups":
            assert request.url.params["visibility"] == "visible"
            data = [group().model_dump(mode="json", by_alias=True)]
        elif path == "/api/v1/tags":
            data = [tag().model_dump(mode="json", by_alias=True)]
        elif path == "/api/v1/tabs":
            assert request.url.params["visibility"] == "visible"
            assert request.url.params["fields"] == "full"
            if "search" in request.url.params:
                assert request.url.params["search"] == original_url
            data = [tab(url=original_url).model_dump(mode="json", by_alias=True)]
        else:
            raise AssertionError(path)
        return httpx.Response(200, json={"data": data, "size": 1, "total": 1, "hasNext": False})

    api = MCPClient("http://server", "secret")
    await api._http.aclose()  # noqa: SLF001
    api._http = httpx.AsyncClient(  # noqa: SLF001
        base_url="http://server/api/v1/",
        headers={"X-API-Key": "secret"},
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(MCPClient, "from_environment", classmethod(lambda cls: api))

    async with Client(main.mcp, read_timeout_seconds=10) as client:
        resources = (await client.list_resources()).resources
        templates = (await client.list_resource_templates()).resource_templates
        prompts = (await client.list_prompts()).prompts
        assert len(resources) == 2 and len(templates) == 3 and len(prompts) == 3
        assert all(item.title and item.description for item in [*resources, *templates, *prompts])
        assert all(arg.description for prompt in prompts for arg in prompt.arguments or [])
        assert seen == []

        for uri in [
            "tabvault://groups",
            "tabvault://tags",
            "tabvault://recent",
            "tabvault://unassigned?limit=8",
            "tabvault://tabs?" + urlencode({"url": original_url}),
        ]:
            result = await client.read_resource(uri, cache_mode="bypass")
            content = result.contents[0]
            assert str(content.uri) == uri
            assert content.mime_type == "application/json"
            payload = json.loads(content.text)
            records = payload["data"] if isinstance(payload["data"], list) else [payload["data"]]
            assert all(not ({"id", "groupId", "position"} & set(record)) for record in records)
            if isinstance(payload["data"], list):
                assert payload["size"] == payload["total"] == 1
                assert payload["hasNext"] is False
        queries = [request.url.params for request in seen if request.url.path == "/api/v1/tabs"]
        assert queries[0]["limit"] == "50" and queries[0]["sortBy"] == "updatedAt"
        assert queries[1]["limit"] == "8" and queries[1]["groupId"] == "unassigned"

        count = len(seen)
        for name, arguments in [
            ("organize_unassigned", {}),
            ("organize_unassigned", {"limit": "10"}),
            ("weekly_tab_review", {}),
            ("weekly_tab_review", {"period": "14 days"}),
            ("research_digest", {"group": "Research"}),
            ("research_digest", {"group": "Research", "audience": "engineers", "format": "text"}),
        ]:
            rendered = await client.get_prompt(name, arguments)
            assert len(rendered.messages) == 1
            assert rendered.messages[0].role == "user"
            assert rendered.messages[0].content.type == "text"
        assert len(seen) == count

        for uri in [
            "tabvault://recent?limit=0",
            "tabvault://unassigned?limit=101",
            "tabvault://recent?limit=bad",
            "tabvault://tabs",
            "tabvault://tabs?url=%20",
        ]:
            with pytest.raises(MCPError):
                await client.read_resource(uri, cache_mode="bypass")
        for name, arguments in [
            ("organize_unassigned", {"limit": "0"}),
            ("organize_unassigned", {"limit": "101"}),
            ("organize_unassigned", {"limit": "bad"}),
            ("research_digest", {}),
        ]:
            with pytest.raises(MCPError):
                await client.get_prompt(name, arguments)
        assert len(seen) == count
        fail = True
        with pytest.raises(MCPError):
            await client.read_resource("tabvault://groups", cache_mode="bypass")
