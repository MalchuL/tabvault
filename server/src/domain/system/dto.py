"""System health and capability DTOs."""

from typing import Literal

from pydantic import BaseModel

from lib.dto_config import model_config


class StorageCountsDTO(BaseModel):
    """Active database entity counts."""

    tabs: int
    groups: int
    tags: int
    model_config = model_config()


class CapabilityDTO(BaseModel):
    """Availability and remediation for one server feature."""

    available: bool
    error: str | None = None
    fix: str | None = None
    model_config = model_config()


class CapabilitiesDTO(BaseModel):
    """Current optional server capabilities."""

    keyword_search: CapabilityDTO
    model_config = model_config()


class HealthDTO(BaseModel):
    """Server, schema, storage, and vector health."""

    status: Literal["ok"]
    version: str
    schema_version: Literal[5]
    storage: StorageCountsDTO
    model_config = model_config()
