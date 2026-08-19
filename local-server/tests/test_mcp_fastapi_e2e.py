from __future__ import annotations

import asyncio
import os
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import Any

import uvicorn
from mcp import Client

import tabvault_server.main as server_module
from tabvault_server import mcp as bridge
from tabvault_server.healthcheck import IndexHealthScheduler
from tabvault_server.indexing import IndexRebuildScheduler
from tabvault_server.main import LocalStore
from tabvault_server.semantic import SemanticIndex


class McpFastApiEndToEndTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.original_store = server_module.store
        self.original_index = server_module.semantic_index
        self.original_scheduler = server_module.index_scheduler
        self.original_health_scheduler = server_module.health_scheduler
        server_module.store = LocalStore(self.temporary_directory.name)
        server_module.semantic_index = SemanticIndex(Path(self.temporary_directory.name))
        server_module.index_scheduler = IndexRebuildScheduler(
            server_module.store.read, server_module.semantic_index
        )
        server_module.health_scheduler = IndexHealthScheduler(
            Path(self.temporary_directory.name), server_module.semantic_index.status
        )
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as socket_probe:
            socket_probe.bind(("127.0.0.1", 0))
            self.port = socket_probe.getsockname()[1]
        self.server = uvicorn.Server(
            uvicorn.Config(server_module.app, host="127.0.0.1", port=self.port, log_level="warning")
        )
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.thread.start()
        deadline = time.monotonic() + 5
        while not self.server.started:
            if time.monotonic() > deadline:
                raise TimeoutError("FastAPI test server did not start")
            time.sleep(0.01)

    def tearDown(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=5)
        server_module.store = self.original_store
        server_module.semantic_index = self.original_index
        server_module.index_scheduler = self.original_scheduler
        server_module.health_scheduler = self.original_health_scheduler
        self.temporary_directory.cleanup()

    def test_mcp_client_can_create_save_and_list_through_fastapi(self) -> None:
        previous_url = os.environ.get("TABVAULT_SERVER_URL")
        previous_key = os.environ.get("TABVAULT_API_KEY")
        os.environ["TABVAULT_SERVER_URL"] = f"http://127.0.0.1:{self.port}"
        os.environ["TABVAULT_API_KEY"] = "admin"

        async def run_agent_workflow() -> dict[str, Any]:
            async with Client(bridge.mcp) as client:
                group = await client.call_tool("create_group", {"name": "Agent research"})
                group_id = group.structured_content["group"]["id"]
                await client.call_tool(
                    "save_tab",
                    {
                        "url": "https://example.com/agent?utm_source=mcp",
                        "title": "Agent workflow",
                        "tags": ["agent"],
                        "groupId": group_id,
                    },
                )
                listed = await client.call_tool("list_tabs", {"group": group_id})
                return listed.structured_content

        try:
            result = asyncio.run(run_agent_workflow())
        finally:
            if previous_url is None:
                os.environ.pop("TABVAULT_SERVER_URL", None)
            else:
                os.environ["TABVAULT_SERVER_URL"] = previous_url
            if previous_key is None:
                os.environ.pop("TABVAULT_API_KEY", None)
            else:
                os.environ["TABVAULT_API_KEY"] = previous_key

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["tabs"][0]["url"], "https://example.com/agent")
