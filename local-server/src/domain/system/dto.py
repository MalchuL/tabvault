"""Typed requests and results for system and transfer use cases."""

from datetime import datetime
from pathlib import Path
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field

from domain.tabs.dto import TabDTO
from lib.dto_config import DTO, model_config
from lib.responses import IssueDTO, WarningDTO

SearchMode: TypeAlias = Literal["semantic", "keyword", "hybrid"]
PropertyFilterOperator: TypeAlias = Literal["eq", "ne", "gt", "gte", "lt", "lte"]
SearchMatchType: TypeAlias = Literal["both", "semantic", "keyword"]
SearchMatchedOn: TypeAlias = Literal[
    "title", "url", "note", "agentReview", "tags", "customProperties", "semantic"
]
TransferFormat: TypeAlias = Literal["json", "markdown"]
ImportMode: TypeAlias = Literal["upload", "replace"]
ExportFields: TypeAlias = Literal["full", "minimal"]
JobKind: TypeAlias = Literal["preview_capture", "search_reindex", "backup_restore"]
JobStatus: TypeAlias = Literal["pending", "running", "done", "failed"]
PreviewStatus: TypeAlias = Literal["pending", "running", "ready", "unavailable"]
AssetKind: TypeAlias = Literal["image", "icon"]
HealthResult: TypeAlias = Literal["ready", "needs_attention"]
VectorStatus: TypeAlias = Literal["ready", "not_ready"]


class PropertyFilterDTO(BaseModel):
    """Define one typed predicate over a resolved Custom Property Value.

    Attributes:
        name (str): Declared property name to evaluate.
        operator (PropertyFilterOperator): Equality or ordered comparison operation.
        value (Any): Comparison value validated against the current schema by the service.
    """

    name: str
    operator: PropertyFilterOperator
    value: Any
    model_config = model_config()


class StructuredSearchDTO(BaseModel):
    """Describe search text plus typed dynamic-property predicates.

    Attributes:
        query (str): Non-empty free-text query scored by the selected search mode.
        property_filters (list[PropertyFilterDTO]): Predicates all matching tabs must satisfy.
        mode (SearchMode): Keyword, semantic, or hybrid scoring mode.
        limit (int): Maximum number of results.
        group_id (str | None): Optional exact Group filter.
        tags (list[str]): Tag names that must all be present.
        min_score (float): Minimum semantic score accepted from the provider.
    """

    query: str = Field(min_length=1)
    property_filters: list[PropertyFilterDTO] = Field(default_factory=list, max_length=64)
    mode: SearchMode = "hybrid"
    limit: int = Field(default=10, ge=1, le=50)
    group_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    min_score: float = Field(default=0.3, ge=0, le=1)
    model_config = model_config()


class HealthConfigDTO(BaseModel):
    """Configure recurring vector-index health checks.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        interval_seconds (int): Typed interval seconds value carried by this object.
        notify_on_needs_attention (bool | None): Typed notify on needs attention value carried by
            this object.
    """

    interval_seconds: int = Field(ge=0, le=86400)
    notify_on_needs_attention: bool | None = None
    model_config = model_config()


class ImportEnvelopeDTO(BaseModel):
    """Wrap JSON imports that specify their own mode and format.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        mode (ImportMode): Typed mode value carried by this object.
        format (TransferFormat): Typed format value carried by this object.
        content (object): Typed content value carried by this object.
    """

    mode: ImportMode
    format: TransferFormat
    content: object
    model_config = model_config()


class StorageCountsDTO(BaseModel):
    """Report active database entity counts.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tabs (int): Typed tabs value carried by this object.
        groups (int): Typed groups value carried by this object.
        tags (int): Tags associated with the Saved Tab.
    """

    tabs: int
    groups: int
    tags: int
    model_config = model_config()


class VectorStatusDTO(BaseModel):
    """Describe local vector-index availability.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        status (VectorStatus): Current lifecycle or readiness state.
        indexed_count (int): Number of indexed records represented by this object.
        provider (Literal["sentence-transformers"]): Implementation that supplies the reported
            capability.
        model (str): Configured embedding model identifier.
        last_error (str | None): Typed last error value carried by this object.
    """

    status: VectorStatus
    indexed_count: int
    provider: Literal["sentence-transformers"]
    model: str
    last_error: str | None
    model_config = model_config()


class CapabilityDTO(BaseModel):
    """Describe whether one server feature is usable in this process.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        available (bool): Whether the current process can provide the feature.
        error (str | None): Short explanation when the feature is unavailable.
        fix (str | None): Operator-facing remediation when the feature is unavailable.
    """

    available: bool
    error: str | None = None
    fix: str | None = None
    model_config = model_config()


class CapabilitiesDTO(BaseModel):
    """Report which local-server features are available right now.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        keyword_search (CapabilityDTO): Substring search over titles, notes, URLs, and tags.
        semantic_search (CapabilityDTO): Embedding runtime required for meaning-based search.
        vector_index (CapabilityDTO): Rebuilt local embedding index used by semantic search.
    """

    keyword_search: CapabilityDTO
    semantic_search: CapabilityDTO
    vector_index: CapabilityDTO
    model_config = model_config()


class HealthDTO(BaseModel):
    """Describe server, schema, storage, and vector health.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        status (Literal["ok"]): Current lifecycle or readiness state.
        version (str): Typed version value carried by this object.
        schema_version (Literal[2]): Typed schema version value carried by this object.
        storage (StorageCountsDTO): Typed storage value carried by this object.
        vector_index (VectorStatusDTO): Typed vector index value carried by this object.
    """

    status: Literal["ok"]
    version: str
    schema_version: Literal[3]
    storage: StorageCountsDTO
    vector_index: VectorStatusDTO
    model_config = model_config()


class SearchItemDTO(BaseModel):
    """Represent one scored search result.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tab (TabDTO): Typed tab value carried by this object.
        score (float): Typed score value carried by this object.
        match_type (SearchMatchType): Typed match type value carried by this object.
        matched_on (SearchMatchedOn): Typed matched on value carried by this object.
    """

    tab: TabDTO
    score: float
    match_type: SearchMatchType
    matched_on: SearchMatchedOn
    model_config = model_config()


class SearchMetaDTO(BaseModel):
    """Report search timing metadata.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        query_embedding_ms (int): Typed query embedding ms value carried by this object.
        search_ms (int): Typed search ms value carried by this object.
    """

    query_embedding_ms: int
    search_ms: int
    model_config = model_config()


class SearchResultDTO(BaseModel):
    """Contain search results, timing, and warnings.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        results (list[SearchItemDTO]): Typed results value carried by this object.
        meta (SearchMetaDTO): Optional endpoint-specific metadata.
        warnings (list[WarningDTO]): Structured non-fatal issues.
    """

    results: list[SearchItemDTO]
    meta: SearchMetaDTO
    warnings: list[WarningDTO]
    model_config = model_config()


class SearchDataDTO(BaseModel):
    """Expose search results inside the API data envelope.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        results (list[SearchItemDTO]): Typed results value carried by this object.
    """

    results: list[SearchItemDTO]
    model_config = model_config()


class JobQueuedDTO(BaseModel):
    """Identify a queued background job.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        job_id (str): Stable identifier of the related job.
    """

    job_id: str
    model_config = model_config()


class JobDTO(DTO):
    """Represent background job state.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        status (JobStatus): Current lifecycle or readiness state.
        progress (float): Typed progress value carried by this object.
        result (dict[str, Any] | None): Typed result value carried by this object.
        error (str | None): Typed error value carried by this object.
        created_at (datetime): UTC instant at which the record was created.
        updated_at (datetime): UTC instant at which the record was last changed.
    """

    id: str
    status: JobStatus
    progress: float
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime


class BackupDTO(DTO):
    """Represent an available backup snapshot.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        created_at (datetime): UTC instant at which the record was created.
        reason (str): Typed reason value carried by this object.
        size_bytes (int): Typed size bytes value carried by this object.
    """

    id: str
    created_at: datetime
    reason: str
    size_bytes: int


class BackupListDataDTO(BaseModel):
    """Expose backup snapshots inside an API data envelope.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        backups (list[BackupDTO]): Typed backups value carried by this object.
    """

    backups: list[BackupDTO]
    model_config = model_config()


class PreviewDTO(DTO):
    """Represent captured preview content or its pending state.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tab_id (str): Stable identifier of the related tab.
        status (PreviewStatus): Current lifecycle or readiness state.
        title (str | None): Human-readable title.
        byline (str | None): Typed byline value carried by this object.
        site_name (str | None): Typed site name value carried by this object.
        excerpt (str | None): Typed excerpt value carried by this object.
        content_html (str | None): Typed content html value carried by this object.
        length (int | None): Typed length value carried by this object.
        source_url (str | None): URL used for source.
        error (str | None): Typed error value carried by this object.
        fetched_at (datetime | None): UTC instant associated with fetched.
        fallback_asset (str): Typed fallback asset value carried by this object.
    """

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


class AssetFileDTO(BaseModel):
    """Describe an asset file ready for an HTTP file response.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        path (Path): Typed path value carried by this object.
        media_type (str): Typed media type value carried by this object.
    """

    path: Path
    media_type: str
    model_config = model_config()


class HealthScheduleDTO(DTO):
    """Represent vector-index health-check scheduling state.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        enabled (bool): Typed enabled value carried by this object.
        interval_seconds (int): Typed interval seconds value carried by this object.
        notify_on_needs_attention (bool): Typed notify on needs attention value carried by this
            object.
        last_check (datetime | None): Typed last check value carried by this object.
        last_result (HealthResult | None): Typed last result value carried by this object.
        last_alert (datetime | None): Typed last alert value carried by this object.
    """

    enabled: bool
    interval_seconds: int
    notify_on_needs_attention: bool
    last_check: datetime | None
    last_result: HealthResult | None
    last_alert: datetime | None


class IndexStatusDTO(VectorStatusDTO):
    """Combine vector-index and health-schedule state.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        health_check (HealthScheduleDTO): Typed health check value carried by this object.
    """

    health_check: HealthScheduleDTO


class LibraryClearDTO(BaseModel):
    """Report library clearing and its safety backup.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        cleared (Literal[True]): Typed cleared value carried by this object.
        backup_snapshot_id (str): Stable identifier of the related backup snapshot.
    """

    cleared: Literal[True]
    backup_snapshot_id: str
    model_config = model_config()


class TransferTagDTO(DTO):
    """Represent a tag in a portable library document.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        name (str): Typed name value carried by this object.
        description (str | None): Optional human-readable explanatory text.
        created_at (datetime | None): UTC instant at which the record was created.
        updated_at (datetime | None): UTC instant at which the record was last changed.
    """

    name: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferGroupDTO(DTO):
    """Represent a group in a portable library document.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        name (str): Typed name value carried by this object.
        category (str): Free-form Group category, such as ``session`` or ``manual``.
        description (str | None): Optional human-readable explanatory text.
        color (str | None): Typed color value carried by this object.
        position (float): Stable display position within the current Group or Unassigned section.
        created_at (datetime | None): UTC instant at which the record was created.
        updated_at (datetime | None): UTC instant at which the record was last changed.
    """

    id: str
    name: str
    category: str
    description: str | None = ""
    color: str | None = None
    position: float = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferTabDTO(DTO):
    """Represent a tab in a portable library document.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        url (str): Original saved URL, preserved without canonicalization.
        title (str): Human-readable title.
        favicon (str | None): Typed favicon value carried by this object.
        note (str | None): User-authored note stored with the Saved Tab.
        agent_review (str | None): Agent-authored review text stored with the Saved Tab.
        custom_properties (dict[str, Any]): Raw explicit Custom Property Values.
        tags (list[str]): Tags associated with the Saved Tab.
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        position (float): Stable display position within the current Group or Unassigned section.
        archived (bool): Whether the record is outside the active library.
        archived_at (datetime | None): UTC instant at which the record entered the archive.
        hidden_until (datetime | None): Absolute UTC deadline before which the tab stays hidden.
        created_at (datetime | None): UTC instant at which the record was created.
        updated_at (datetime | None): UTC instant at which the record was last changed.
    """

    id: str
    url: str
    title: str
    favicon: str | None = None
    note: str | None = None
    agent_review: str | None = ""
    custom_properties: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    group_id: str | None = None
    position: float = 0
    archived: bool = False
    archived_at: datetime | None = None
    hidden_until: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferDocumentDTO(DTO):
    """Represent the versioned portable TabVault document.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        schema_version (Literal[3]): Typed schema version value carried by this object.
        exported_at (datetime | None): UTC instant associated with exported.
        property_schema (dict[str, Any]): Definitions keyed by stable custom-property name.
        tags (list[TransferTagDTO]): Tags associated with the Saved Tab.
        groups (list[TransferGroupDTO]): Typed groups value carried by this object.
        tabs (list[TransferTabDTO]): Typed tabs value carried by this object.
    """

    schema_version: Literal[3] = 3
    exported_at: datetime | None = None
    property_schema: dict[str, Any] = Field(default_factory=dict)
    tags: list[TransferTagDTO] = Field(default_factory=list)
    groups: list[TransferGroupDTO] = Field(default_factory=list)
    tabs: list[TransferTabDTO] = Field(default_factory=list)


class MinimalTransferTabDTO(BaseModel):
    """Represent the minimal portable tab projection.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        url (str): Original saved URL, preserved without canonicalization.
        title (str): Human-readable title.
        favicon (str | None): Typed favicon value carried by this object.
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        tags (list[str]): Tags associated with the Saved Tab.
    """

    id: str
    url: str
    title: str
    favicon: str | None = None
    group_id: str | None = None
    tags: list[str]
    model_config = model_config()


class MinimalTransferDocumentDTO(DTO):
    """Represent a portable document with minimal tab fields.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        schema_version (Literal[3]): Typed schema version value carried by this object.
        exported_at (datetime | None): UTC instant associated with exported.
        tags (list[TransferTagDTO]): Tags associated with the Saved Tab.
        groups (list[TransferGroupDTO]): Typed groups value carried by this object.
        tabs (list[MinimalTransferTabDTO]): Typed tabs value carried by this object.
    """

    schema_version: Literal[3] = 3
    exported_at: datetime | None = None
    property_schema: dict[str, Any] = Field(default_factory=dict)
    tags: list[TransferTagDTO]
    groups: list[TransferGroupDTO]
    tabs: list[MinimalTransferTabDTO]


class TransferExportDTO(BaseModel):
    """Contain rendered export content and its media type.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        content (str | TransferDocumentDTO | MinimalTransferDocumentDTO): Typed content value
            carried by this object.
        media_type (str): Typed media type value carried by this object.
    """

    content: str | TransferDocumentDTO | MinimalTransferDocumentDTO
    media_type: str
    model_config = model_config()


class ImportCountsDTO(BaseModel):
    """Count imported entities by bounded-context type.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tabs (int): Typed tabs value carried by this object.
        groups (int): Typed groups value carried by this object.
        tags (int): Tags associated with the Saved Tab.
    """

    tabs: int = 0
    groups: int = 0
    tags: int = 0
    model_config = model_config()


class ImportValidationDTO(BaseModel):
    """Report import validity and anticipated mutations.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        valid (bool): Typed valid value carried by this object.
        errors (list[IssueDTO]): Structured fatal or per-item issues.
        warnings (list[WarningDTO]): Structured non-fatal issues.
        would_create (ImportCountsDTO): Typed would create value carried by this object.
        would_update (ImportCountsDTO): Typed would update value carried by this object.
        would_skip (ImportCountsDTO): Typed would skip value carried by this object.
    """

    valid: bool
    errors: list[IssueDTO]
    warnings: list[WarningDTO]
    would_create: ImportCountsDTO
    would_update: ImportCountsDTO
    would_skip: ImportCountsDTO
    model_config = model_config()


class ImportApplyDataDTO(BaseModel):
    """Report mutations performed by a successful import.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        mode (ImportMode): Typed mode value carried by this object.
        created (ImportCountsDTO): Typed created value carried by this object.
        updated (ImportCountsDTO): Typed updated value carried by this object.
        skipped_duplicates (int): Typed skipped duplicates value carried by this object.
        backup_snapshot_id (str | None): Stable identifier of the related backup snapshot.
    """

    mode: ImportMode
    created: ImportCountsDTO
    updated: ImportCountsDTO
    skipped_duplicates: int
    backup_snapshot_id: str | None
    model_config = model_config()


class ImportApplyResultDTO(BaseModel):
    """Represent the complete import HTTP response.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        success (bool): Whether the enclosing API operation succeeded.
        data (ImportApplyDataDTO | None): Typed response payload.
        errors (list[IssueDTO] | None): Structured fatal or per-item issues.
        warnings (list[WarningDTO]): Structured non-fatal issues.
    """

    success: bool
    data: ImportApplyDataDTO | None = None
    errors: list[IssueDTO] | None = None
    warnings: list[WarningDTO]
    model_config = model_config()


class ExtractedArticleDTO(BaseModel):
    """Represent sanitized article fields extracted from HTML.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        title (str | None): Human-readable title.
        byline (str | None): Typed byline value carried by this object.
        site_name (str | None): Typed site name value carried by this object.
        excerpt (str | None): Typed excerpt value carried by this object.
        content_html (str): Typed content html value carried by this object.
        length (int): Typed length value carried by this object.
    """

    title: str | None
    byline: str | None
    site_name: str | None
    excerpt: str | None
    content_html: str
    length: int
    model_config = model_config()


class PreviewCaptureResultDTO(BaseModel):
    """Report the outcome of a background preview capture.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tab_id (str | None): Stable identifier of the related tab.
        status (PreviewStatus | None): Current lifecycle or readiness state.
        skipped (Literal["tab_not_found"] | None): Typed skipped value carried by this object.
        error (str | None): Typed error value carried by this object.
    """

    tab_id: str | None = None
    status: PreviewStatus | None = None
    skipped: Literal["tab_not_found"] | None = None
    error: str | None = None
    model_config = model_config()
