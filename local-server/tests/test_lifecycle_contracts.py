from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from tabvault_server.main import RestoreTabPayload, TabUpdatePayload, merge_documents, normalise_url
from tabvault_server.semantic import SemanticIndex, SemanticUnavailable


class UrlCanonicalizationTests(unittest.TestCase):
    def test_normalises_equivalent_urls_to_one_identity(self) -> None:
        raw = "HTTPS://Example.COM:443/research/?b=2&utm_source=news&a=1#section"
        self.assertEqual(
            normalise_url(raw),
            "https://example.com/research?a=1&b=2",
        )


class MergeDocumentTests(unittest.TestCase):
    def test_merge_keeps_existing_records_and_unions_duplicate_url_tags(self) -> None:
        current = {
            "schemaVersion": 1,
            "tags": [{"name": "research", "description": "seed"}],
            "groups": [{"id": "research", "name": "Research"}],
            "tabs": [
                {
                    "id": "keep",
                    "url": "https://example.com/topic",
                    "title": "Original",
                    "note": "Local note",
                    "tags": ["research"],
                    "archived": False,
                }
            ],
        }
        incoming = {
            "schemaVersion": 1,
            "tags": [{"name": "inbox", "description": "from client"}],
            "groups": [
                {"id": "research", "name": "Research desk"},
                {"id": "build", "name": "Build"},
            ],
            "tabs": [
                {
                    "id": "incoming-dup",
                    "url": "https://example.com/topic?utm_source=x",
                    "title": "Incoming title",
                    "note": "",
                    "tags": ["inbox"],
                    "archived": False,
                },
                {
                    "id": "new-tab",
                    "url": "https://example.com/new",
                    "title": "New",
                    "tags": [],
                    "archived": False,
                },
            ],
        }
        merged, warnings = merge_documents(current, incoming)
        self.assertEqual({group["id"] for group in merged["groups"]}, {"research", "build"})
        self.assertEqual(
            next(group["name"] for group in merged["groups"] if group["id"] == "research"),
            "Research desk",
        )
        tabs = {tab["id"]: tab for tab in merged["tabs"]}
        self.assertIn("keep", tabs)
        self.assertIn("new-tab", tabs)
        self.assertNotIn("incoming-dup", tabs)
        self.assertEqual(tabs["keep"]["title"], "Original")
        self.assertEqual(set(tabs["keep"]["tags"]), {"research", "inbox"})
        self.assertTrue(any(warning["code"] == "W_DUPLICATE_URL" for warning in warnings))


class MutationSchemaTests(unittest.TestCase):
    def test_update_schema_rejects_unknown_fields(self) -> None:
        with self.assertRaises(ValidationError):
            TabUpdatePayload.model_validate({"unexpected": "value"})

    def test_restore_schema_rejects_unknown_fields(self) -> None:
        with self.assertRaises(ValidationError):
            RestoreTabPayload.model_validate(
                {
                    "id": "tab-1",
                    "url": "https://example.com",
                    "title": "Example",
                    "unexpected": True,
                }
            )


class SemanticLifecycleTests(unittest.TestCase):
    def test_stale_index_never_rebuilds_in_search_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            index = SemanticIndex(Path(directory))
            index.rows = {"tab-1": {"fingerprint": "known", "vector": [0.1]}}
            index.mark_stale()
            with self.assertRaisesRegex(SemanticUnavailable, "explicit rebuild"):
                index.search(
                    "research",
                    {"tabs": [{"id": "tab-1", "title": "Research"}]},
                )
