"""System health and capability DTOs."""

from typing import Literal, TypeAlias

from pydantic import BaseModel

from lib.dto_config import model_config

VectorStatus: TypeAlias = Literal["ready", "not_ready"]


class StorageCountsDTO(BaseModel):
    """Active database entity counts."""

    tabs: int
    groups: int
    tags: int
    model_config = model_config()


class VectorConfigurationDTO(BaseModel):
    """Embedding provider and model reported by the local index."""

    provider: Literal["sentence-transformers"]
    model: str
    model_config = model_config()


class VectorDiagnosticsDTO(BaseModel):
    """Latest indexing failure, if any."""

    last_error: str | None
    model_config = model_config()


class VectorStatusDTO(BaseModel):
    """Local vector-index availability and grouped configuration."""

    status: VectorStatus
    indexed_count: int
    configuration: VectorConfigurationDTO
    diagnostics: VectorDiagnosticsDTO
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
    semantic_search: CapabilityDTO
    vector_index: CapabilityDTO
    model_config = model_config()


class HealthDTO(BaseModel):
    """Server, schema, storage, and vector health."""

    status: Literal["ok"]
    version: str
    schema_version: Literal[4]
    storage: StorageCountsDTO
    vector_index: VectorStatusDTO
    model_config = model_config()
