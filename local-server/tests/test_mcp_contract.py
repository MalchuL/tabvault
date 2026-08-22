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
    "save_tabs_batch",
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
    "export_data",
    "import_data",
    "validate_import",
}


def test_every_mandatory_mcp_tool_has_schema_and_all_annotations() -> None:
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


def test_mcp_api_client_uses_new_prefix_and_api_key(monkeypatch) -> None:
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


def test_all_mcp_functions_forward_rest_shapes(monkeypatch) -> None:
    calls = []

    class FakeApi:
        def request(self, *args, **kwargs):
            calls.append((args, kwargs))
            return {"success": True}

    monkeypatch.setattr(bridge, "api", lambda: FakeApi())
    assert bridge.list_tabs()["success"]
    bridge.search_tabs("query")
    bridge.get_tab("tab")
    bridge.save_tab(
        "https://example.com",
        agentReview="Agent summary",
        viewed=True,
        groupId="group",
    )
    bridge.save_tabs_batch([{"url": "https://example.com"}], atomic=True)
    bridge.update_tab("tab", title="Changed", agentReview="Revised", viewed=False)
    bridge.delete_tab("tab", hard=True)
    bridge.move_tab("tab", targetGroupId="group", position=1)
    bridge.list_groups()
    bridge.create_group("Group", description="Filing context")
    bridge.update_group("group", description="Updated context", color="#fff")
    bridge.delete_group("group", "promote")
    bridge.list_tags()
    bridge.tag_tab("tab", "docs")
    bridge.untag_tab("tab", "docs")
    bridge.export_data("json")
    bridge.import_data("upload", "json", {"schemaVersion": 1})
    bridge.validate_import("markdown", "## Inbox")
    assert len(calls) == len(MANDATORY)
    assert all(str(args[1]).startswith("/") for args, _kwargs in calls)
    assert calls[3][0][2]["tabs"][0]["agentReview"] == "Agent summary"
    assert calls[3][0][2]["tabs"][0]["viewed"] is True
    assert calls[9][0][2]["description"] == "Filing context"


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
