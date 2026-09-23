"""System metadata and health operations."""

import json
from pathlib import Path
from typing import Any, cast

from domain.indexing.vector_index import LocalVectorIndex
from lib.time import utc_now

from .capabilities import build_capabilities, probe_module
from .dto import CapabilitiesDTO, HealthDTO, StorageCountsDTO
from .repository import SystemRepository


class SystemService:
    """Report process health and bundled API metadata."""

    def __init__(self, vectors: LocalVectorIndex, repository: SystemRepository) -> None:
        """Initialize system health dependencies."""
        self.vectors = vectors
        self.repository = repository

    async def health(self) -> HealthDTO:
        """Return process, storage, and vector-index health."""
        tabs, groups, tags = await self.repository.health_counts(utc_now())
        return HealthDTO(
            status="ok",
            version="0.2.0",
            schema_version=3,
            storage=StorageCountsDTO(tabs=tabs, groups=groups, tags=tags),
            vector_index=self.vectors.status(),
        )

    async def capabilities(self) -> CapabilitiesDTO:
        """Return available keyword, semantic, and vector features."""
        vector = self.vectors.status()
        semantic_error = (
            probe_module("sentence_transformers") or probe_module("zvec") or vector.last_error
        )
        return build_capabilities(
            semantic_error=semantic_error,
            index_ready=vector.status == "ready",
        )

    @staticmethod
    def schema() -> dict[str, Any]:
        """Load the canonical portable-document schema."""
        path = Path(__file__).parents[3] / "schema" / "v3.tabvault.schema.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))

    @staticmethod
    def errors() -> dict[str, Any]:
        """Load the stable API error catalog."""
        path = Path(__file__).parents[3] / "errors" / "catalog.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
