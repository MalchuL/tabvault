from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from tabvault_server.main import RestoreTabPayload, TabUpdatePayload, normalise_url
from tabvault_server.semantic import SemanticIndex, SemanticUnavailable


class UrlCanonicalizationTests(unittest.TestCase):
    def test_normalises_equivalent_urls_to_one_identity(self) -> None:
        raw = "HTTPS://Example.COM:443/research/?b=2&utm_source=news&a=1#section"
        self.assertEqual(
            normalise_url(raw),
            "https://example.com/research?a=1&b=2",
        )


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
