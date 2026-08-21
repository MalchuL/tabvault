"""Typed requests and results for system and transfer use cases."""

from datetime import datetime
from pathlib import Path
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field

from domain.tabs.dto import TabDTO
from lib.dto_config import model_config
from lib.responses import IssueDTO, WarningDTO

SearchMode: TypeAlias = Literal["semantic", "keyword", "hybrid"]
SearchMatchType: TypeAlias = Literal["both", "semantic", "keyword"]
SearchMatchedOn: TypeAlias = Literal["title", "url", "note", "tags", "semantic"]
TransferFormat: TypeAlias = Literal["json", "markdown"]
ImportMode: TypeAlias = Literal["upload", "replace"]
ExportFields: TypeAlias = Literal["full", "minimal"]
JobKind: TypeAlias = Literal["preview_capture", "search_reindex", "backup_restore"]
JobStatus: TypeAlias = Literal["pending", "running", "done", "failed"]
PreviewStatus: TypeAlias = Literal["pending", "running", "ready", "unavailable"]
AssetKind: TypeAlias = Literal["image", "icon"]
HealthResult: TypeAlias = Literal["ready", "needs_attention"]
VectorStatus: TypeAlias = Literal["ready", "not_ready"]


class HealthConfigDTO(BaseModel):
    """Configure recurring vector-index health checks."""

    interval_seconds: int = Field(ge=0, le=86400)
    notify_on_needs_attention: bool | None = None
    model_config = model_config()


class ImportEnvelopeDTO(BaseModel):
    """Wrap JSON imports that specify their own mode and format."""

    mode: ImportMode
    format: TransferFormat
    content: object
    model_config = model_config()


class StorageCountsDTO(BaseModel):
    """Report active database entity counts."""

    tabs: int
    groups: int
    tags: int
    model_config = model_config()


class VectorStatusDTO(BaseModel):
    """Describe local vector-index availability."""

    status: VectorStatus
    indexed_count: int
    provider: Literal["sentence-transformers"]
    model: str
    last_error: str | None
    model_config = model_config()


class HealthDTO(BaseModel):
    """Describe server, schema, storage, and vector health."""

    status: Literal["ok"]
    version: str
    schema_version: Literal[1]
    storage: StorageCountsDTO
    vector_index: VectorStatusDTO
    model_config = model_config()


class SearchItemDTO(BaseModel):
    """Represent one scored search result."""

    tab: TabDTO
    score: float
    match_type: SearchMatchType
    matched_on: SearchMatchedOn
    model_config = model_config()


class SearchMetaDTO(BaseModel):
    """Report search timing metadata."""

    query_embedding_ms: int
    search_ms: int
    model_config = model_config()


class SearchResultDTO(BaseModel):
    """Contain search results, timing, and warnings."""

    results: list[SearchItemDTO]
    meta: SearchMetaDTO
    warnings: list[WarningDTO]
    model_config = model_config()


class SearchDataDTO(BaseModel):
    """Expose search results inside the API data envelope."""

    results: list[SearchItemDTO]
    model_config = model_config()


class JobQueuedDTO(BaseModel):
    """Identify a queued background job."""

    job_id: str
    model_config = model_config()


class JobDTO(BaseModel):
    """Represent background job state."""

    id: str
    status: JobStatus
    progress: float
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    model_config = model_config()


class BackupDTO(BaseModel):
    """Represent an available backup snapshot."""

    id: str
    created_at: datetime
    reason: str
    size_bytes: int
    model_config = model_config()


class BackupListDataDTO(BaseModel):
    """Expose backup snapshots inside an API data envelope."""

    backups: list[BackupDTO]
    model_config = model_config()


class PreviewDTO(BaseModel):
    """Represent captured preview content or its pending state."""

    tab_id: str
    status: PreviewStatus
    title: str | None = None
    byline: str | None = None
    site_name: str | None = None
    excerpt: str | None = None
    content_html: str | None = None
    length: int | None = None
    source_url: str | None = None
    error: str | None = None
    fetched_at: datetime | None = None
    fallback_asset: str
    model_config = model_config()


class AssetFileDTO(BaseModel):
    """Describe an asset file ready for an HTTP file response."""

    path: Path
    media_type: str
    model_config = model_config()


class HealthScheduleDTO(BaseModel):
    """Represent vector-index health-check scheduling state."""

    enabled: bool
    interval_seconds: int
    notify_on_needs_attention: bool
    last_check: datetime | None
    last_result: HealthResult | None
    last_alert: datetime | None
    model_config = model_config()


class IndexStatusDTO(VectorStatusDTO):
    """Combine vector-index and health-schedule state."""

    health_check: HealthScheduleDTO


class LibraryClearDTO(BaseModel):
    """Report library clearing and its safety backup."""

    cleared: Literal[True]
    backup_snapshot_id: str
    model_config = model_config()


class TransferTagDTO(BaseModel):
    """Represent a tag in a portable library document."""

    name: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = model_config()


class TransferGroupDTO(BaseModel):
    """Represent a group in a portable library document."""

    id: str
    name: str
    parent_id: str | None = None
    color: str | None = None
    position: float = 0
    archived: bool = False
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = model_config()


class TransferTabDTO(BaseModel):
    """Represent a tab in a portable library document."""

    id: str
    url: str
    title: str
    favicon: str | None = None
    note: str | None = None
    tags: list[str] = Field(default_factory=list)
    group_id: str | None = None
    position: float = 0
    archived: bool = False
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = model_config()


class TransferDocumentDTO(BaseModel):
    """Represent the versioned portable TabVault document."""

    schema_version: Literal[1] = 1
    exported_at: datetime | None = None
    tags: list[TransferTagDTO] = Field(default_factory=list)
    groups: list[TransferGroupDTO] = Field(default_factory=list)
    tabs: list[TransferTabDTO] = Field(default_factory=list)
    model_config = model_config()


class MinimalTransferTabDTO(BaseModel):
    """Represent the minimal portable tab projection."""

    id: str
    url: str
    title: str
    favicon: str | None = None
    group_id: str | None = None
    tags: list[str]
    model_config = model_config()


class MinimalTransferDocumentDTO(BaseModel):
    """Represent a portable document with minimal tab fields."""

    schema_version: Literal[1] = 1
    exported_at: datetime | None = None
    tags: list[TransferTagDTO]
    groups: list[TransferGroupDTO]
    tabs: list[MinimalTransferTabDTO]
    model_config = model_config()


class TransferExportDTO(BaseModel):
    """Contain rendered export content and its media type."""

    content: str | TransferDocumentDTO | MinimalTransferDocumentDTO
    media_type: str
    model_config = model_config()


class ImportCountsDTO(BaseModel):
    """Count imported entities by bounded-context type."""

    tabs: int = 0
    groups: int = 0
    tags: int = 0
    model_config = model_config()


class ImportValidationDTO(BaseModel):
    """Report import validity and anticipated mutations."""

    valid: bool
    errors: list[IssueDTO]
    warnings: list[WarningDTO]
    would_create: ImportCountsDTO
    would_update: ImportCountsDTO
    would_skip: ImportCountsDTO
    model_config = model_config()


class ImportApplyDataDTO(BaseModel):
    """Report mutations performed by a successful import."""

    mode: ImportMode
    created: ImportCountsDTO
    updated: ImportCountsDTO
    skipped_duplicates: int
    backup_snapshot_id: str | None
    model_config = model_config()


class ImportApplyResultDTO(BaseModel):
    """Represent the complete import HTTP response."""

    success: bool
    data: ImportApplyDataDTO | None = None
    errors: list[IssueDTO] | None = None
    warnings: list[WarningDTO]
    model_config = model_config()


class ExtractedArticleDTO(BaseModel):
    """Represent sanitized article fields extracted from HTML."""

    title: str | None
    byline: str | None
    site_name: str | None
    excerpt: str | None
    content_html: str
    length: int
    model_config = model_config()


class PreviewCaptureResultDTO(BaseModel):
    """Report the outcome of a background preview capture."""

    tab_id: str | None = None
    status: PreviewStatus | None = None
    skipped: Literal["tab_not_found"] | None = None
    error: str | None = None
    model_config = model_config()
