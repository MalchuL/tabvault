"""Portable transfer and backup DTOs."""

from datetime import datetime
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field

from lib.dto_config import DTO, model_config
from lib.responses import IssueDTO, WarningDTO

TransferFormat: TypeAlias = Literal["json", "markdown"]
ImportMode: TypeAlias = Literal["upload", "replace"]
ExportFields: TypeAlias = Literal["full", "minimal"]


class ImportEnvelopeDTO(BaseModel):
    """JSON import carrying its own mode and format."""

    mode: ImportMode
    format: TransferFormat
    content: object
    model_config = model_config()


class BackupDTO(DTO):
    """Available backup snapshot."""

    id: str
    created_at: datetime
    reason: str
    size_bytes: int


class BackupListDataDTO(BaseModel):
    """Backup snapshots inside the API data envelope."""

    backups: list[BackupDTO]
    model_config = model_config()


class LibraryClearDTO(BaseModel):
    """Library clear result and its safety backup."""

    cleared: Literal[True]
    backup_snapshot_id: str
    model_config = model_config()


class TransferTagDTO(DTO):
    """Tag in a portable library document."""

    name: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferGroupDTO(DTO):
    """Group in a portable library document."""

    id: str
    name: str
    category: str
    description: str | None = ""
    color: str | None = None
    position: float = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferTabDTO(DTO):
    """Tab in a portable library document."""

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
    """Complete schema-v3 portable library document."""

    schema_version: Literal[3] = 3
    exported_at: datetime | None = None
    property_schema: dict[str, Any] = Field(default_factory=dict)
    tags: list[TransferTagDTO] = Field(default_factory=list)
    groups: list[TransferGroupDTO] = Field(default_factory=list)
    tabs: list[TransferTabDTO] = Field(default_factory=list)


class MinimalTransferTabDTO(BaseModel):
    """Minimal portable tab projection."""

    id: str
    url: str
    title: str
    favicon: str | None = None
    group_id: str | None = None
    tags: list[str]
    model_config = model_config()


class MinimalTransferDocumentDTO(DTO):
    """Portable document with minimal tab fields."""

    schema_version: Literal[3] = 3
    exported_at: datetime | None = None
    property_schema: dict[str, Any] = Field(default_factory=dict)
    tags: list[TransferTagDTO]
    groups: list[TransferGroupDTO]
    tabs: list[MinimalTransferTabDTO]


class TransferExportDTO(BaseModel):
    """Rendered export content and media type."""

    content: str | TransferDocumentDTO | MinimalTransferDocumentDTO
    media_type: str
    model_config = model_config()


class ImportCountsDTO(BaseModel):
    """Imported entity counts."""

    tabs: int = 0
    groups: int = 0
    tags: int = 0
    model_config = model_config()


class ImportValidationDTO(BaseModel):
    """Import validity and anticipated mutations."""

    valid: bool
    errors: list[IssueDTO]
    warnings: list[WarningDTO]
    would_create: ImportCountsDTO
    would_update: ImportCountsDTO
    would_skip: ImportCountsDTO
    model_config = model_config()


class ImportApplyDataDTO(BaseModel):
    """Mutations performed by a successful import."""

    mode: ImportMode
    created: ImportCountsDTO
    updated: ImportCountsDTO
    skipped_duplicates: int
    backup_snapshot_id: str | None
    model_config = model_config()


class ImportApplyResultDTO(BaseModel):
    """Complete import HTTP response."""

    success: bool
    data: ImportApplyDataDTO | None = None
    errors: list[IssueDTO] | None = None
    warnings: list[WarningDTO]
    model_config = model_config()
