from __future__ import annotations

import asyncio
import json
from email.message import Message

import pytest

from mcp_bridge import main as bridge

MANDATORY = {
    "list_tabs",
    "search_tabs",
    "get_tab",
    "save_tab",
    "update_tab",
    "delete_tab",
    "move_tab",
    "list_groups",
    "create_group",
    "update_group",
    "delete_group",
    "list_tags",
    "tag_tab",
    "untag_tab",
}


def test_every_mcp_tool_has_schema_and_all_annotations() -> None:
    tools = asyncio.run(bridge.mcp.list_tools())
    by_name = {tool.name: tool for tool in tools}
    assert set(by_name) == MANDATORY
    for tool in by_name.values():
        assert tool.input_schema["type"] == "object"
        assert tool.output_schema is not None
        assert tool.annotations is not None
        assert tool.annotations.read_only_hint is not None
        assert tool.annotations.destructive_hint is not None
        assert tool.annotations.idempotent_hint is not None
        assert tool.annotations.open_world_hint is not None


def test_mcp_api_client_uses_api_prefix_and_key(monkeypatch) -> None:
    captured = {}

    class Response:
        headers = Message()

        def __enter__(self):
            self.headers["Content-Type"] = "application/json"
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps({"success": True, "data": {}}).encode()

    def fake_urlopen(request, timeout):
        captured.update(url=request.full_url, key=request.get_header("X-api-key"), timeout=timeout)
        return Response()

    monkeypatch.setattr(bridge, "urlopen", fake_urlopen)
    result = bridge.TabVaultApi("http://127.0.0.1:47821", "secret").request("GET", "/tabs")
    assert result["success"] is True
    assert captured == {
        "url": "http://127.0.0.1:47821/api/v1/tabs",
        "key": "secret",
        "timeout": 30,
    }


def test_mcp_functions_forward_v2_single_resource_shapes(monkeypatch) -> None:
    calls: list[tuple[tuple, dict]] = []

    class FakeApi:
        def request(self, *args, **kwargs):
            calls.append((args, kwargs))
            if args[0:2] == ("GET", "/groups"):
                return {"data": [{"id": "group"}], "hasNext": False, "size": 1, "total": 1}
            if args[0] == "GET" and args[1].endswith("/tabs"):
                return {"data": [], "hasNext": False, "size": 0, "total": 0}
            if args[0] == "GET" and args[1].startswith("/tabs/"):
                return {
                    "success": True,
                    "data": {"id": "tab", "archived": False, "hiddenUntil": None},
                }
            return {"success": True, "data": {}}

    fake = FakeApi()
    monkeypatch.setattr(bridge, "api", lambda: fake)
    bridge.list_tabs(groupId="unassigned")
    bridge.list_tabs(category="session")
    bridge.search_tabs("query")
    bridge.get_tab("tab")
    bridge.save_tab(
        "https://example.com",
        agentReview="Agent summary",
        viewed=True,
        groupId="group",
    )
    bridge.update_tab("tab", title="Changed", hiddenUntil="2030-01-01T00:00:00Z")
    bridge.delete_tab("tab")
    bridge.move_tab("tab", targetGroupId="group", position=1)
    bridge.move_tab("tab", targetGroupId=None)
    bridge.list_groups(category="manual")
    bridge.create_group("Group", description="Filing context")
    bridge.update_group("group", description="Updated context", color="#fff")
    bridge.delete_group("group")
    bridge.list_tags()
    bridge.tag_tab("tab", "docs")
    bridge.untag_tab("tab", "docs")

    tab_lists = [call for call in calls if call[0][0:2] == ("GET", "/tabs")]
    assert tab_lists[0][1]["query"]["groupId"] == "unassigned"
    assert tab_lists[0][1]["query"]["visibility"] == "visible"
    assert tab_lists[0][1]["query"]["offset"] == 0
    assert tab_lists[1][1]["query"]["category"] == "session"
    create = next(call for call in calls if call[0][0:2] == ("POST", "/tabs"))
    assert create[0][2]["url"] == "https://example.com"
    assert "tabs" not in create[0][2]
    move = next(
        call for call in calls if call[0][0:2] == ("PATCH", "/tabs/tab") and "groupId" in call[0][2]
    )
    assert move[0][2] == {"groupId": "group", "position": 1}
    created_group = next(call for call in calls if call[0][0:2] == ("POST", "/groups"))
    assert created_group[0][2]["category"] == "manual"
    changed_group = next(call for call in calls if call[0][0:2] == ("PATCH", "/groups/group"))
    assert changed_group[0][2]["category"] == "manual"
    assert next(call for call in calls if call[0][0:2] == ("DELETE", "/groups/group"))[1] == {}


@pytest.mark.parametrize(
    "record",
    [
        {"id": "tab", "archived": True, "hiddenUntil": None},
        {"id": "tab", "archived": False, "hiddenUntil": "2999-01-01T00:00:00Z"},
    ],
)
def test_mcp_known_hidden_or_archived_tab_cannot_be_read_or_mutated(monkeypatch, record) -> None:
    calls: list[tuple] = []

    class FakeApi:
        def request(self, *args, **_kwargs):
            calls.append(args)
            return {"success": True, "data": record}

    monkeypatch.setattr(bridge, "api", lambda: FakeApi())
    for operation in (
        lambda: bridge.get_tab("tab"),
        lambda: bridge.update_tab("tab", title="No"),
        lambda: bridge.delete_tab("tab"),
        lambda: bridge.move_tab("tab"),
        lambda: bridge.tag_tab("tab", "tag"),
        lambda: bridge.untag_tab("tab", "tag"),
    ):
        with pytest.raises(bridge.TabVaultApiError, match="not accessible"):
            operation()
    assert all(call[0:2] == ("GET", "/tabs/tab") for call in calls)


def test_mcp_cannot_target_hidden_group_or_delete_group_with_hidden_members(monkeypatch) -> None:
    class HiddenGroupApi:
        def request(self, method, path, *_args, **_kwargs):
            if (method, path) == ("GET", "/tabs/tab"):
                return {
                    "success": True,
                    "data": {"id": "tab", "archived": False, "hiddenUntil": None},
                }
            assert (method, path) == ("GET", "/groups")
            return {"data": [], "hasNext": False, "size": 0, "total": 0}

    monkeypatch.setattr(bridge, "api", lambda: HiddenGroupApi())
    for operation in (
        lambda: bridge.save_tab("https://example.com", groupId="hidden"),
        lambda: bridge.move_tab("tab", targetGroupId="hidden"),
        lambda: bridge.update_group("hidden", name="No"),
        lambda: bridge.delete_group("hidden"),
    ):
        with pytest.raises(bridge.TabVaultApiError, match="not accessible"):
            operation()

    calls: list[tuple[str, str]] = []

    class MixedGroupApi:
        def request(self, method, path, *_args, **_kwargs):
            calls.append((method, path))
            if path == "/groups":
                return {"data": [{"id": "mixed"}], "hasNext": False, "size": 1, "total": 1}
            return {"data": [{"id": "hidden"}], "hasNext": False, "size": 1, "total": 1}

    monkeypatch.setattr(bridge, "api", lambda: MixedGroupApi())
    with pytest.raises(bridge.TabVaultApiError, match="not accessible"):
        bridge.delete_group("mixed")
    assert not any(method == "DELETE" for method, _path in calls)


def test_mcp_api_error_and_environment_paths(monkeypatch) -> None:
    from io import BytesIO
    from urllib.error import HTTPError, URLError

    monkeypatch.setenv("TABVAULT_SERVER_URL", "http://server")
    monkeypatch.setenv("TABVAULT_API_KEY", "key")
    assert bridge.TabVaultApi.from_environment().api_key == "key"

    error = HTTPError("http://server", 422, "bad", {}, BytesIO(b'{"error":"bad"}'))
    monkeypatch.setattr(bridge, "urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(error))
    with pytest.raises(bridge.TabVaultApiError, match="422"):
        bridge.TabVaultApi("http://server", None).request("GET", "/tabs")

    monkeypatch.setattr(
        bridge, "urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(URLError("offline"))
    )
    with pytest.raises(bridge.TabVaultApiError, match="unavailable"):
        bridge.TabVaultApi("http://server", None).request("GET", "/tabs")
