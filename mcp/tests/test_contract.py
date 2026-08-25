from __future__ import annotations

import inspect
import types
from collections.abc import Callable
from typing import Any, get_args, get_origin, get_type_hints

import pytest
from factories import tab

from mcp_tabvault import main
from mcp_tabvault.client import MCPClient
from mcp_tabvault.client.dto import TabDTO
from mcp_tabvault.domain.groups import tools as group_tools
from mcp_tabvault.domain.groups import utils as group_utils
from mcp_tabvault.domain.tabs import tools as tab_tools
from mcp_tabvault.domain.tabs import utils as tab_utils
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
    "reorder_tabs",
    "get_tab_by_url",
    "list_tabs_by_url",
    "update_tabs_by_url",
    "tag_tabs_by_url",
    "untag_tabs_by_url",
    "list_groups",
    "create_group",
    "update_group",
    "delete_group",
    "list_tags",
    "tag_tab",
    "untag_tab",
}


@pytest.mark.anyio
async def test_all_tools_have_typed_schemas_and_safety_annotations() -> None:
    registered = await main.mcp.list_tools()
    by_name = {tool.name: tool for tool in registered}

    assert set(by_name) == TOOLS
    for tool in by_name.values():
        assert tool.input_schema["type"] == "object"
        assert tool.output_schema is not None
        assert tool.output_schema.get("additionalProperties") is False
        assert tool.annotations is not None
        assert tool.annotations.read_only_hint is not None
        assert tool.annotations.destructive_hint is not None
        assert tool.annotations.idempotent_hint is not None
        assert tool.annotations.open_world_hint is not None
    assert "result" in by_name["get_tab_by_url"].output_schema["properties"]
    assert set(by_name["update_tabs_by_url"].output_schema["properties"]) == {
        "matched",
        "data",
        "errors",
    }


@pytest.mark.anyio
async def test_mcp_v2_converts_returned_dto_to_structured_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def result(_url: str) -> list[TabDTO]:
        return [tab()]

    monkeypatch.setattr(tab_tools.utils, "matching_tabs", result)
    response = await main.mcp.call_tool("get_tab_by_url", {"url": "https://exact"})
    assert response.structured_content is not None
    assert response.structured_content["result"]["id"] == "tab"


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
    functions = [
        *public_functions(group_utils),
        *public_functions(tab_utils),
        *public_functions(group_tools),
        *public_functions(tab_tools),
        *public_functions(tag_tools),
    ]
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
