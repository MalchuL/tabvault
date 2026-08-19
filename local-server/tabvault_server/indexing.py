"""Coalescing background work for the derived semantic index."""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

from .semantic import SemanticIndex, SemanticUnavailable


class IndexRebuildScheduler:
    """Run at most one derived-index rebuild at a time and collapse duplicate requests."""

    def __init__(
        self,
        document_reader: Callable[[], dict[str, Any]],
        semantic_index: SemanticIndex,
    ) -> None:
        self._document_reader = document_reader
        self._semantic_index = semantic_index
        self._wake = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name="tabvault-semantic-index",
        )
        self._thread.start()

    def request_rebuild(self) -> dict[str, Any]:
        self._semantic_index.mark_queued()
        self._wake.set()
        return self._semantic_index.status()

    def _run(self) -> None:
        while True:
            self._wake.wait()
            self._wake.clear()
            try:
                self._semantic_index.reindex(self._document_reader())
            except SemanticUnavailable as error:
                self._semantic_index.unavailable(error)
