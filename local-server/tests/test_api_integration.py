from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import tabvault_server.main as server_module
from tabvault_server.healthcheck import IndexHealthScheduler
from tabvault_server.indexing import IndexRebuildScheduler
from tabvault_server.main import LocalStore
from tabvault_server.semantic import SemanticIndex


class FastApiContractTests(unittest.TestCase):
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
        self.client = TestClient(server_module.app)
        self.headers = {"Authorization": "Bearer admin"}

    def tearDown(self) -> None:
        server_module.store = self.original_store
        server_module.semantic_index = self.original_index
        server_module.index_scheduler = self.original_scheduler
        server_module.health_scheduler = self.original_health_scheduler
        self.temporary_directory.cleanup()

    def test_auth_schema_and_error_catalog_are_agent_readable(self) -> None:
        self.assertEqual(self.client.get("/health").status_code, 401)
        self.assertEqual(self.client.get("/health", headers=self.headers).status_code, 200)

        docs = self.client.get("/docs")
        openapi = self.client.get("/openapi.json")
        self.assertEqual(docs.status_code, 200)
        self.assertEqual(openapi.status_code, 200)
        security_schemes = openapi.json()["components"]["securitySchemes"]
        self.assertEqual(security_schemes["API Key"]["type"], "http")
        self.assertEqual(security_schemes["API Key"]["scheme"], "bearer")
        self.assertIn({"API Key": []}, openapi.json()["paths"]["/health"]["get"]["security"])

        schema = self.client.get("/v1/schema", headers=self.headers)
        errors = self.client.get("/v1/errors", headers=self.headers)
        self.assertEqual(schema.status_code, 200)
        self.assertEqual(errors.status_code, 200)
        self.assertEqual(schema.json()["properties"]["schemaVersion"]["const"], 1)
        self.assertIn("E_INVALID_URL", errors.json())

    def test_group_tab_archive_restore_and_strict_mutation_contract(self) -> None:
        invalid_group = self.client.post(
            "/v1/groups",
            headers=self.headers,
            json={"name": "Research", "unexpected": True},
        )
        self.assertEqual(invalid_group.status_code, 422)

        group = self.client.post(
            "/v1/groups", headers=self.headers, json={"name": "Research"}
        ).json()["group"]
        created = self.client.post(
            "/v1/tabs",
            headers=self.headers,
            json={
                "url": "https://example.com/topic?utm_source=news&a=1",
                "title": "Original title",
                "note": "Original note",
                "tags": ["research"],
                "groupId": group["id"],
            },
        )
        self.assertEqual(created.status_code, 200)
        tab = created.json()["tab"]
        self.assertEqual(tab["url"], "https://example.com/topic?a=1")

        archived = self.client.patch(
            f"/v1/tabs/{tab['id']}", headers=self.headers, json={"archived": True}
        )
        self.assertEqual(archived.status_code, 200)
        restored = self.client.post(
            "/v1/tabs",
            headers=self.headers,
            json={
                "url": "https://example.com/topic?a=1",
                "title": "Replacement title must not overwrite metadata",
                "tags": [],
                "groupId": None,
            },
        )
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.json()["restored"])
        self.assertEqual(restored.json()["tab"]["title"], "Original title")
        self.assertEqual(restored.json()["tab"]["groupId"], group["id"])

        invalid_update = self.client.patch(
            f"/v1/tabs/{tab['id']}",
            headers=self.headers,
            json={"groupId": "missing-group"},
        )
        self.assertEqual(invalid_update.status_code, 422)

    def test_import_returns_all_validation_errors_without_mutating_store(self) -> None:
        document = {
            "schemaVersion": 99,
            "tags": [],
            "groups": [],
            "tabs": [
                {"id": "same", "url": "not-a-url", "title": "Broken", "tags": []},
                {"id": "same", "url": "https://example.com", "title": "Duplicate", "tags": []},
            ],
        }
        response = self.client.post(
            "/v1/import",
            headers=self.headers,
            json={"mode": "upload", "format": "json", "content": document},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["success"])
        self.assertGreaterEqual(len(payload["errors"]), 3)
        self.assertEqual(self.client.get("/v1/library", headers=self.headers).json()["tabs"], [])
