from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest
from factories import NOW, group, tab, tag
from pydantic import ValidationError

from mcp_tabvault.client import (
    DEFAULT_SERVER_URL,
    MCPClient,
    MCPClientError,
    close_client,
    get_client,
)
from mcp_tabvault.client.dto import (
    GroupCreateDTO,
    GroupListQueryDTO,
    GroupTabsQueryDTO,
    GroupUpdateDTO,
    SearchQueryDTO,
    TabCreateDTO,
    TabDTO,
    TabListQueryDTO,
    TabReorderDTO,
    TabTagDTO,
    TabUpdateDTO,
    TagListQueryDTO,
)


def install_transport(
    client: MCPClient, handler: Callable[[httpx.Request], httpx.Response]
) -> None:
    def with_schema(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/property-schema":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "properties": {
                            "viewed": {
                                "description": "",
                                "type": "boolean",
                                "default": False,
                            }
                        }
                    },
                },
            )
        return handler(request)

    client._http = httpx.AsyncClient(  # noqa: SLF001
        base_url=f"{client.base_url}/api/v1/",
        headers={"X-API-Key": client.api_key or ""},
        transport=httpx.MockTransport(with_schema),
    )


@pytest.mark.anyio
async def test_singleton_reads_environment_once_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TABVAULT_SERVER_URL", "http://server/")
    monkeypatch.setenv("TABVAULT_HTTP__API_KEY", "key")
    first = get_client()
    monkeypatch.setenv("TABVAULT_SERVER_URL", "http://changed")

    assert get_client() is first
    assert first.base_url == "http://server"
    assert first.api_key == "key"

    await close_client()
    assert get_client.cache_info().currsize == 0
    replacement = get_client()
    assert replacement.base_url == "http://changed"
    await close_client()


@pytest.mark.anyio
async def test_environment_defaults_and_dto_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TABVAULT_SERVER_URL", raising=False)
    monkeypatch.setenv("TABVAULT_HTTP__API_KEY", "")
    client = get_client()
    assert client.base_url == DEFAULT_SERVER_URL
    assert client.api_key is None
    assert TabCreateDTO.model_validate(
        {"content": {"url": "https://example.com"}, "annotations": {"agent_review": "ok"}}
    ).model_dump(by_alias=True, exclude_unset=True) == {
        "content": {"url": "https://example.com"},
        "annotations": {"agentReview": "ok"},
    }
    naive = tab().model_dump(mode="json", by_alias=True)
    naive["timestamps"]["createdAt"] = "2026-08-24T16:38:22.557000"
    naive["timestamps"]["updatedAt"] = "2026-08-24T16:38:22.557000"
    assert (
        TabDTO.model_validate(naive).model_dump(mode="json", by_alias=True)["timestamps"][
            "createdAt"
        ]
        == "2026-08-24T16:38:22.557000Z"
    )
    with pytest.raises(ValidationError, match="duplicates"):
        TabReorderDTO(tab_ids=["same", "same"])
    await close_client()


@pytest.mark.anyio
async def test_all_client_operations_are_typed_and_use_current_routes() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        path = request.url.path
        if path == "/api/v1/tabs" and request.method == "GET":
            return httpx.Response(
                200, json={"data": [tab().model_dump(mode="json", by_alias=True)]}
            )
        if path == "/api/v1/search":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "results": [
                            {
                                "tab": tab().model_dump(mode="json", by_alias=True),
                                "score": 1,
                                "matchType": "both",
                                "matchedOn": "url",
                            }
                        ]
                    },
                    "meta": {"queryEmbeddingMs": 1, "searchMs": 2},
                },
            )
        if path == "/api/v1/tabs/order":
            return httpx.Response(
                200,
                json={"success": True, "data": {"groupId": None, "tabIds": ["tab"]}},
            )
        if path == "/api/v1/tabs/tab" and request.method == "DELETE":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {"id": "tab", "deletedAt": NOW.isoformat(), "hard": False},
                },
            )
        if path == "/api/v1/tabs" and request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": tab().model_dump(mode="json", by_alias=True),
                    "meta": {"job": {"tabId": "tab", "jobId": "job"}},
                },
            )
        if path.startswith("/api/v1/tabs/tab"):
            return httpx.Response(
                200,
                json={"success": True, "data": tab().model_dump(mode="json", by_alias=True)},
            )
        if path == "/api/v1/groups/group/tabs":
            return httpx.Response(200, json={"data": []})
        if path == "/api/v1/groups" and request.method == "GET":
            return httpx.Response(
                200, json={"data": [group().model_dump(mode="json", by_alias=True)]}
            )
        if path == "/api/v1/groups/group" and request.method == "DELETE":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "id": "group",
                        "archivedTabCount": 0,
                        "deletedAt": NOW.isoformat(),
                    },
                },
            )
        if path.startswith("/api/v1/groups"):
            return httpx.Response(
                200,
                json={"success": True, "data": group().model_dump(mode="json", by_alias=True)},
            )
        if path == "/api/v1/tags":
            return httpx.Response(
                200, json={"data": [tag().model_dump(mode="json", by_alias=True)]}
            )
        raise AssertionError(f"unexpected request: {request.method} {path}")

    client = MCPClient("http://server", "secret")
    install_transport(client, handler)
    assert (
        await client.list_tabs(
            TabListQueryDTO.model_validate({"filters": {"group_id": "unassigned"}})
        )
    ).data[0].id == "tab"
    assert (await client.search_tabs(SearchQueryDTO(q="query"))).data.results[0].score == 1
    assert (await client.get_tab("tab")).data.id == "tab"
    created = await client.create_tab(
        TabCreateDTO.model_validate({"content": {"url": "https://example.com"}})
    )
    assert created.meta is not None and created.meta.job.job_id == "job"
    assert (
        await client.update_tab(
            "tab", TabUpdateDTO.model_validate({"content": {"title": "Changed"}})
        )
    ).data.id == "tab"
    assert (await client.delete_tab("tab")).data.hard is False
    assert (await client.reorder_tabs(TabReorderDTO(tab_ids=["tab"]))).data.tab_ids == ["tab"]
    assert not (await client.list_group_tabs("group", GroupTabsQueryDTO())).data
    assert (await client.list_groups(GroupListQueryDTO())).data[0].id == "group"
    assert (
        await client.create_group(GroupCreateDTO.model_validate({"details": {"name": "Group"}}))
    ).data.id == "group"
    assert (
        await client.update_group(
            "group", GroupUpdateDTO.model_validate({"details": {"name": "New"}})
        )
    ).data.id == "group"
    assert (await client.delete_group("group")).data.archived_tab_count == 0
    assert (await client.list_tags(TagListQueryDTO())).data[0].name == "docs"
    assert (await client.tag_tab("tab", TabTagDTO(tag_name="docs"))).data.id == "tab"
    assert (await client.untag_tab("tab", "docs")).data.id == "tab"

    create = next(
        request
        for request in seen
        if request.method == "POST" and request.url.path == "/api/v1/tabs"
    )
    update = next(
        request
        for request in seen
        if request.method == "PATCH" and request.url.path == "/api/v1/tabs/tab"
    )
    assert create.headers["X-API-Key"] == "secret"
    assert create.content == b'{"content":{"url":"https://example.com"}}'
    assert update.content == b'{"content":{"title":"Changed"}}'
    assert seen[0].url.params["groupId"] == "unassigned"
    await client.aclose()


@pytest.mark.anyio
async def test_viewed_write_registers_property_once_after_read_only_requests() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/api/v1/property-schema" and request.method == "GET":
            return httpx.Response(200, json={"success": True, "data": {"properties": {}}})
        if request.url.path == "/api/v1/property-schema" and request.method == "POST":
            return httpx.Response(200, json={"success": True, "data": {"properties": {}}})
        if request.url.path == "/api/v1/tabs":
            if request.method == "GET":
                return httpx.Response(200, json={"data": []})
            return httpx.Response(200, json={"data": tab().model_dump(mode="json", by_alias=True)})
        if request.url.path == "/api/v1/tabs/tab":
            return httpx.Response(200, json={"data": tab().model_dump(mode="json", by_alias=True)})
        raise AssertionError(f"unexpected request: {request.method} {request.url.path}")

    client = MCPClient("http://server", "secret")
    client._http = httpx.AsyncClient(  # noqa: SLF001
        base_url="http://server/api/v1/", transport=httpx.MockTransport(handler)
    )
    assert not (await client.list_tabs(TabListQueryDTO())).data
    assert [request.method for request in seen] == ["GET"]
    await client.create_tab(
        TabCreateDTO.model_validate(
            {"content": {"url": "https://exact"}, "annotations": {"viewed": False}}
        )
    )
    await client.update_tab("tab", TabUpdateDTO.model_validate({"annotations": {"viewed": True}}))
    assert [request.method for request in seen] == ["GET", "GET", "POST", "POST", "PATCH"]
    assert seen[2].content == (
        b'{"name":"viewed","description":"","type":"boolean","default":false}'
    )
    await client.aclose()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(500, text="plain failure"), "plain failure"),
        (
            httpx.Response(
                422,
                json={
                    "success": False,
                    "errors": [
                        {
                            "code": "bad",
                            "path": "url",
                            "message": "invalid",
                            "expected": "URL",
                            "received": None,
                            "httpStatus": 422,
                        }
                    ],
                },
            ),
            "invalid",
        ),
        (httpx.Response(200, text="not json"), "invalid JSON"),
        (httpx.Response(200, json={"data": [{"unexpected": True}]}), "invalid response shape"),
    ],
)
async def test_client_translates_http_and_validation_errors(
    response: httpx.Response, message: str
) -> None:
    client = MCPClient("http://server")
    install_transport(client, lambda _request: response)
    with pytest.raises(MCPClientError, match=message):
        await client.list_tabs(TabListQueryDTO())
    await client.aclose()


@pytest.mark.anyio
async def test_client_translates_connection_failure() -> None:
    def unavailable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    client = MCPClient("http://server")
    install_transport(client, unavailable)
    with pytest.raises(MCPClientError, match="unavailable"):
        await client.list_tabs(TabListQueryDTO())
    await client.aclose()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "definition",
    [
        {"type": "boolean", "description": "Keep this", "default": True},
        {"type": "string", "description": "Keep this", "default": "no"},
    ],
)
async def test_viewed_write_preserves_existing_schema(definition: dict[str, object]) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/api/v1/property-schema":
            assert request.method == "GET"
            return httpx.Response(200, json={"data": {"properties": {"viewed": definition}}})
        return httpx.Response(200, json={"data": tab().model_dump(mode="json", by_alias=True)})

    client = MCPClient("http://server")
    await client._http.aclose()  # noqa: SLF001
    client._http = httpx.AsyncClient(  # noqa: SLF001
        base_url="http://server/api/v1/", transport=httpx.MockTransport(handler)
    )
    try:
        if definition["type"] == "boolean":
            await client.update_tab(
                "tab", TabUpdateDTO.model_validate({"annotations": {"viewed": True}})
            )
            assert [request.method for request in seen] == ["GET", "PATCH"]
        else:
            with pytest.raises(MCPClientError, match="type boolean"):
                await client.update_tab(
                    "tab", TabUpdateDTO.model_validate({"annotations": {"viewed": True}})
                )
            assert [request.method for request in seen] == ["GET"]
    finally:
        await client.aclose()
