"""System metadata and health operations."""

import json
from pathlib import Path
from typing import Any, cast

from lib.time import utc_now
from lib.version import VERSION

from .dto import CapabilitiesDTO, CapabilityDTO, HealthDTO, StorageCountsDTO
from .repository import SystemRepository


class SystemService:
    """Report process health and bundled API metadata.

    Attributes:
        repository (SystemRepository): Persistence adapter retained for this service instance.
    """

    def __init__(self, repository: SystemRepository) -> None:
        """Initialize system health dependencies.

        Args:
            repository (SystemRepository): Persistence adapter used by this service.
        """
        self.repository = repository

    async def health(self) -> HealthDTO:
        """Return process and storage health.

        Returns:
            HealthDTO: Current service and library health status.
        """
        tabs, groups, tags = await self.repository.health_counts(utc_now())
        return HealthDTO(
            status="ok",
            version=VERSION,
            schema_version=5,
            storage=StorageCountsDTO(tabs=tabs, groups=groups, tags=tags),
        )

    async def capabilities(self) -> CapabilitiesDTO:
        """Return available text search capabilities.

        Returns:
            CapabilitiesDTO: Text search capabilities of this process.
        """
        return CapabilitiesDTO(keyword_search=CapabilityDTO(available=True))

    @staticmethod
    def schema() -> dict[str, Any]:
        """Load the canonical portable-document schema.

        Returns:
            dict[str, Any]: Serialized fields keyed for the caller.
        """
        path = Path(__file__).parents[3] / "schema" / "v5.tabvault.schema.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))

    @staticmethod
    def errors() -> dict[str, Any]:
        """Load the stable API error catalog.

        Returns:
            dict[str, Any]: Serialized fields keyed for the caller.
        """
        path = Path(__file__).parents[3] / "errors" / "catalog.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
