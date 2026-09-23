from __future__ import annotations

import inspect
import types
from collections.abc import Callable
from typing import Any, get_args, get_origin, get_type_hints

import pytest
from factories import group, tab

from mcp_tabvault import main
from mcp_tabvault.client import MCPClient
from mcp_tabvault.client.dto import (
    SearchDataDTO,
    SearchItemDTO,
    SearchMetaDTO,
    SearchResponseDTO,
    TabDTO,
)
from mcp_tabvault.domain.groups import mapper as group_mapper
from mcp_tabvault.domain.groups import prompts as group_prompts
from mcp_tabvault.domain.groups import resources as group_resources
from mcp_tabvault.domain.groups import tools as group_tools
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.domain.tabs import mapper as tab_mapper
from mcp_tabvault.domain.tabs import prompts as tab_prompts
from mcp_tabvault.domain.tabs import resources as tab_resources
from mcp_tabvault.domain.tabs import tools as tab_tools
from mcp_tabvault.domain.tabs import utils as tab_utils
from mcp_tabvault.domain.tags import resources as tag_resources
from mcp_tabvault.domain.tags import tools as tag_tools
from mcp_tabvault.server import lifespan, mcp

TOOLS = {
    "list_tabs",
    "search_tabs",
    "get_tab",
    "save_tab",
    "update_tab",
    "delete_tab",
    "move_tab",
    "list_groups",
    "get_group",
    "create_group",
    "update_group",
    "delete_group",
    "list_tags",
    "tag_tab",
    "untag_tab",
}
FORBIDDEN = {"id", "groupId", "position", "tabId", "jobId", "tabIds"}


def property_names(schema: object) -> set[str]:
    if isinstance(schema, list):
        return set().union(*(property_names(item) for item in schema), set())
    if not isinstance(schema, dict):
        return set()
    names = set(schema.get("properties", {}))
    for value in schema.values():
        names.update(property_names(value))
    return names


@pytest.mark.anyio
async def test_tools_have_id_free_typed_contracts_and_safety_annotations() -> None:
    registered = await main.mcp.list_tools()
    by_name = {tool.name: tool for tool in registered}

    assert set(by_name) == TOOLS
    for tool in by_name.values():
        assert tool.input_schema["type"] == "object"
        assert tool.output_schema is not None
        assert not (property_names(tool.output_schema) & FORBIDDEN)
        assert not (property_names(tool.input_schema) & FORBIDDEN)
        assert tool.annotations is not None
        assert tool.annotations.read_only_hint is not None
        assert tool.annotations.destructive_hint is not None
        assert tool.annotations.idempotent_hint is not None
        assert tool.annotations.open_world_hint is not None
    assert "meta" not in by_name["save_tab"].output_schema["properties"]


@pytest.mark.anyio
async def test_get_tab_structured_output_replaces_ids_with_group_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assigned = tab().model_copy(update={"group_id": "group"})

    async def first(_url: str) -> TabDTO:
        return assigned

    async def visible():
        return [group()]

    monkeypatch.setattr(tab_tools.utils, "first_visible_tab", first)
    monkeypatch.setattr(tab_tools.group_utils, "visible_groups", visible)
    response = await main.mcp.call_tool("get_tab", {"url": "https://exact"})
    assert response.structured_content is not None
    assert response.structured_content["data"]["group"] == "Group"
    assert not (set(response.structured_content["data"]) & FORBIDDEN)


@pytest.mark.anyio
async def test_structured_output_keeps_rfc3339_timestamps(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    naive = tab().model_dump(mode="json", by_alias=True)
    naive["createdAt"] = "2026-08-24T16:38:22.557000"
    naive["updatedAt"] = "2026-08-24T16:38:22.557000"
    parsed = TabDTO.model_validate(naive)

    async def search(*_args: object, **_kwargs: object) -> SearchResponseDTO:
        return SearchResponseDTO(
            data=SearchDataDTO(
                results=[
                    SearchItemDTO(tab=parsed, score=1, match_type="keyword", matched_on="title")
                ]
            ),
            meta=SearchMetaDTO(query_embedding_ms=1, search_ms=2),
        )

    async def visible():
        return []

    monkeypatch.setattr(tab_tools, "get_client", lambda: types.SimpleNamespace(search_tabs=search))
    monkeypatch.setattr(tab_tools.group_utils, "visible_groups", visible)
    response = await main.mcp.call_tool("search_tabs", {"query": "docs"})
    assert response.structured_content is not None
    result = response.structured_content["data"]["results"][0]["tab"]
    assert result["createdAt"] == "2026-08-24T16:38:22.557000Z"
    assert result["updatedAt"] == "2026-08-24T16:38:22.557000Z"


def contains_dict(annotation: object) -> bool:
    origin = get_origin(annotation)
    if annotation is dict or origin is dict:
        return True
    return any(contains_dict(argument) for argument in get_args(annotation))


def public_functions(module: types.ModuleType) -> list[Callable[..., Any]]:
    return [
        function
        for name, function in inspect.getmembers(module, inspect.isfunction)
        if not name.startswith("_") and function.__module__ == module.__name__
    ]


def test_public_layers_never_annotate_dictionary_returns() -> None:
    modules = (
        group_mapper,
        group_prompts,
        group_resources,
        group_utils,
        tab_mapper,
        tab_prompts,
        tab_resources,
        tab_utils,
        tag_resources,
        group_tools,
        tab_tools,
        tag_tools,
    )
    functions = [function for module in modules for function in public_functions(module)]
    methods = [
        method
        for name, method in inspect.getmembers(MCPClient, inspect.isfunction)
        if not name.startswith("_")
    ]
    for function in [*functions, *methods]:
        assert not contains_dict(get_type_hints(function)["return"]), function.__qualname__


@pytest.mark.anyio
async def test_server_lifespan_creates_and_closes_singleton(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr("mcp_tabvault.server.get_client", lambda: calls.append("create"))

    async def close() -> None:
        calls.append("close")

    monkeypatch.setattr("mcp_tabvault.server.close_client", close)
    async with lifespan(mcp):
        assert calls == ["create"]
    assert calls == ["create", "close"]


def test_main_runs_shared_server(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[bool] = []
    monkeypatch.setattr(main.mcp, "run", lambda: called.append(True))
    main.main()
    assert called == [True]
