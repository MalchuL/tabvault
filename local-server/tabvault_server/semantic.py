"""Local semantic index for TabVault. Vectors are a derived cache; tabvault.json remains authoritative."""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class SemanticUnavailable(RuntimeError):
    """The configured local embedding provider cannot currently serve a vector."""


class OllamaEmbeddingProvider:
    def __init__(self) -> None:
        self.base_url = os.environ.get(
            "TABVAULT_EMBEDDING_BASE_URL", "http://127.0.0.1:11434"
        ).rstrip("/")
        self.model = os.environ.get("TABVAULT_EMBEDDING_MODEL", "nomic-embed-text")
        self.timeout = float(os.environ.get("TABVAULT_EMBEDDING_TIMEOUT", "8"))

    def embed(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        payload = json.dumps({"model": self.model, "input": texts}).encode("utf-8")
        request = Request(
            f"{self.base_url}/api/embed",
            data=payload,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
            vectors = body.get("embeddings")
            if (
                isinstance(vectors, list)
                and len(vectors) == len(texts)
                and all(isinstance(vector, list) for vector in vectors)
            ):
                return [[float(value) for value in vector] for vector in vectors]
            if len(texts) == 1 and isinstance(body.get("embedding"), list):
                return [[float(value) for value in body["embedding"]]]
            raise SemanticUnavailable("Embedding provider returned no embedding vector.")
        except HTTPError as error:
            if error.code != 404:
                raise SemanticUnavailable(
                    f"Embedding provider returned HTTP {error.code}."
                ) from error
        except (URLError, TimeoutError, OSError) as error:
            raise SemanticUnavailable("Embedding provider is unavailable.") from error

        # Compatibility with older local providers that implement Ollama's former /api/embeddings route.
        # Compatibility with older local providers that implement one vector per /api/embeddings request.
        results: list[list[float]] = []
        try:
            for text in texts:
                legacy_payload = json.dumps({"model": self.model, "prompt": text}).encode("utf-8")
                legacy_request = Request(
                    f"{self.base_url}/api/embeddings",
                    data=legacy_payload,
                    headers={"content-type": "application/json"},
                    method="POST",
                )
                with urlopen(legacy_request, timeout=self.timeout) as response:
                    body = json.loads(response.read().decode("utf-8"))
                if not isinstance(body.get("embedding"), list):
                    raise SemanticUnavailable("Embedding provider returned no embedding vector.")
                results.append([float(value) for value in body["embedding"]])
            return results
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            raise SemanticUnavailable("Embedding provider is unavailable.") from error


class SemanticIndex:
    def __init__(self, directory: Path) -> None:
        self.path = directory / "tabvault.vectors.json"
        self.provider = OllamaEmbeddingProvider()
        self.rows: dict[str, dict[str, Any]] = {}
        self.last_error: str | None = None
        self.stale = False
        self.batch_size = max(1, int(os.environ.get("TABVAULT_EMBEDDING_BATCH_SIZE", "16")))
        self.progress: dict[str, Any] = {"state": "idle", "total": 0, "processed": 0, "batches": 0}
        self._load()

    @staticmethod
    def text_for(tab: dict[str, Any]) -> str:
        return "\n".join(
            part
            for part in [
                tab.get("title", ""),
                tab.get("note") or "",
                " ".join(tab.get("tags", [])),
                tab.get("url", ""),
            ]
            if part
        )

    @classmethod
    def fingerprint(cls, tab: dict[str, Any]) -> str:
        return hashlib.sha256(cls.text_for(tab).encode("utf-8")).hexdigest()

    def _load(self) -> None:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if payload.get("model") == self.provider.model and isinstance(
                payload.get("rows"), dict
            ):
                self.rows = payload["rows"]
        except (OSError, json.JSONDecodeError, AttributeError):
            self.rows = {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps({"model": self.provider.model, "rows": self.rows}, ensure_ascii=False),
            encoding="utf-8",
        )
        temporary.replace(self.path)

    @staticmethod
    def similarity(left: list[float], right: list[float]) -> float:
        if len(left) != len(right) or not left:
            return 0.0
        denominator = math.sqrt(sum(value * value for value in left)) * math.sqrt(
            sum(value * value for value in right)
        )
        return (
            sum(a * b for a, b in zip(left, right, strict=True)) / denominator
            if denominator
            else 0.0
        )

    def reindex(self, document: dict[str, Any]) -> dict[str, Any]:
        tabs = [tab for tab in document.get("tabs", []) if not tab.get("archived")]
        next_rows: dict[str, dict[str, Any]] = {}
        pending: list[tuple[str, str, str]] = []
        for tab in tabs:
            tab_id = tab.get("id")
            if not isinstance(tab_id, str):
                continue
            fingerprint = self.fingerprint(tab)
            existing = self.rows.get(tab_id)
            if (
                existing
                and existing.get("fingerprint") == fingerprint
                and isinstance(existing.get("vector"), list)
            ):
                next_rows[tab_id] = existing
                continue
            pending.append((tab_id, fingerprint, self.text_for(tab)))

        self.progress = {"state": "indexing", "total": len(pending), "processed": 0, "batches": 0}
        embedded = 0
        try:
            for start in range(0, len(pending), self.batch_size):
                batch = pending[start : start + self.batch_size]
                vectors = self.provider.embed_many([text for _, _, text in batch])
                if len(vectors) != len(batch):
                    raise SemanticUnavailable("Embedding provider returned an incomplete batch.")
                for (tab_id, fingerprint, _), vector in zip(batch, vectors, strict=True):
                    next_rows[tab_id] = {"fingerprint": fingerprint, "vector": vector}
                    embedded += 1
                self.rows = next_rows
                self.progress = {
                    "state": "indexing",
                    "total": len(pending),
                    "processed": min(start + len(batch), len(pending)),
                    "batches": (start // self.batch_size) + 1,
                }
                self._save()
            self.rows = next_rows
            self.last_error = None
            self.stale = False
            self.progress = {
                "state": "ready",
                "total": len(pending),
                "processed": len(pending),
                "batches": (len(pending) + self.batch_size - 1) // self.batch_size,
            }
            self._save()
            return {
                "status": "ready",
                "indexedTabs": len(self.rows),
                "embedded": embedded,
                "provider": "ollama",
                "model": self.provider.model,
                "batchSize": self.batch_size,
                "progress": self.progress,
            }
        except SemanticUnavailable as error:
            self.rows = next_rows
            self.last_error = str(error)
            self.stale = True
            self.progress = {**self.progress, "state": "unavailable"}
            self._save()
            raise

    def search(self, query: str, document: dict[str, Any], limit: int = 25) -> list[dict[str, Any]]:
        expected_ids = {
            tab.get("id") for tab in document.get("tabs", []) if not tab.get("archived")
        }
        if self.stale or not self.rows or not expected_ids.issubset(self.rows):
            raise SemanticUnavailable("Semantic index needs an explicit rebuild.")
        query_vector = self.provider.embed(query)
        scores: list[tuple[str, float]] = [
            (tab_id, round(self.similarity(query_vector, row["vector"]), 4))
            for tab_id, row in self.rows.items()
            if tab_id in expected_ids
        ]
        return [
            {"id": tab_id, "score": score}
            for tab_id, score in sorted(scores, key=lambda item: item[1], reverse=True)[:limit]
        ]

    def status(self) -> dict[str, Any]:
        return {
            "status": "ready"
            if self.rows and not self.last_error and not self.stale
            else "not_ready",
            "indexedTabs": len(self.rows),
            "provider": "ollama",
            "model": self.provider.model,
            "baseUrl": self.provider.base_url,
            "batchSize": self.batch_size,
            "progress": self.progress,
            "lastError": self.last_error,
        }

    def unavailable(self, error: Exception) -> None:
        self.last_error = str(error)

    def mark_stale(self) -> None:
        self.stale = True

    def mark_queued(self) -> None:
        self.stale = True
        self.progress = {
            "state": "queued",
            "total": 0,
            "processed": 0,
            "batches": 0,
        }
