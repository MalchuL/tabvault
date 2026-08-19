from __future__ import annotations

import asyncio
import json
import unittest
from unittest.mock import patch

from mcp import Client

from tabvault_server import mcp as bridge


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class PythonMcpBridgeTests(unittest.TestCase):
    def test_registers_complete_agent_library_tools(self) -> None:
        names = {tool.name for tool in asyncio.run(bridge.mcp.list_tools())}
        self.assertTrue(
            {
                "list_tabs",
                "get_tab",
                "search_tabs",
                "save_tab",
                "save_tabs",
                "update_tab",
                "move_tab",
                "archive_tab",
                "delete_tab",
                "create_group",
                "update_group",
                "delete_group",
                "list_groups",
                "add_tag",
                "remove_tag",
                "list_tags",
                "import_data",
                "export_data",
                "schema_definition",
                "error_catalog",
            }.issubset(names)
        )

    @patch("tabvault_server.mcp.urlopen")
    def test_forwards_bearer_auth_and_agent_inputs_to_fastapi(self, mocked_urlopen: object) -> None:
        mocked_urlopen.return_value = FakeResponse({"tabs": [], "count": 0})  # type: ignore[attr-defined]
        result = bridge.list_tabs(group="research", tag="docs", fields="minimal")
        self.assertEqual(result["count"], 0)

        request = mocked_urlopen.call_args.args[0]  # type: ignore[attr-defined]
        self.assertEqual(request.get_header("Authorization"), "Bearer admin")
        self.assertIn("group=research", request.full_url)
        self.assertIn("tag=docs", request.full_url)
        self.assertIn("fields=minimal", request.full_url)

    @patch("tabvault_server.mcp.urlopen")
    def test_official_mcp_client_dispatches_a_registered_tool(self, mocked_urlopen: object) -> None:
        mocked_urlopen.return_value = FakeResponse({"tabs": [], "count": 0})  # type: ignore[attr-defined]

        async def call_through_protocol() -> object:
            async with Client(bridge.mcp) as client:
                return await client.call_tool("list_tabs", {"fields": "minimal"})

        result = asyncio.run(call_through_protocol())
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, {"tabs": [], "count": 0})
