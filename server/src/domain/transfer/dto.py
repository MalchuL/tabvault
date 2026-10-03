"""Portable transfer and backup DTOs."""

from datetime import datetime
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field, field_validator

from domain.custom_properties.dto import PropertyDefinitionDTO, is_json_value
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


class DatabaseBackupDTO(BaseModel):
    """Absolute server-side path to a completed SQLite database copy.

    Attributes:
        path (str): Location of the standalone database backup on the server filesystem.
    """

    path: str
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


class TransferGroupDetailsDTO(DTO):
    """Details fields for TransferGroupDTO."""

    name: str
    category: str
    description: str | None = ""
    color: str | None = None


class TransferGroupPlacementDTO(DTO):
    """Placement fields for TransferGroupDTO."""

    position: float = Field(default=0, ge=0, allow_inf_nan=False)


class TransferGroupTimestampsDTO(DTO):
    """Timestamps fields for TransferGroupDTO."""

    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferGroupDTO(DTO):
    """Group in a portable library document. Fields are grouped by responsibility."""

    id: str
    details: TransferGroupDetailsDTO
    placement: TransferGroupPlacementDTO = Field(default_factory=TransferGroupPlacementDTO)
    timestamps: TransferGroupTimestampsDTO = Field(default_factory=TransferGroupTimestampsDTO)


class TransferTabContentDTO(DTO):
    """Content fields for TransferTabDTO."""

    url: str
    title: str


class TransferTabAnnotationsDTO(DTO):
    """Annotations fields for TransferTabDTO."""

    custom_properties: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)

    @field_validator("custom_properties")
    @classmethod
    def finite_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        """Preserve raw values while rejecting non-JSON data.

        Args:
            value (dict[str, Any]): Explicit overrides, including undeclared names.

        Returns:
            dict[str, Any]: Finite JSON values unchanged.

        Raises:
            ValueError: An override cannot be represented in JSON.
        """
        if not is_json_value(value):
            raise ValueError("customProperties must contain finite JSON values")
        return value


class TransferTabPlacementDTO(DTO):
    """Placement fields for TransferTabDTO."""

    group_id: str | None = None
    position: float = Field(default=0, ge=0, allow_inf_nan=False)


class TransferTabLifecycleDTO(DTO):
    """Lifecycle fields for TransferTabDTO."""

    archived: bool = False
    archived_at: datetime | None = None
    hidden_until: datetime | None = None


class TransferTabTimestampsDTO(DTO):
    """Timestamps fields for TransferTabDTO."""

    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransferTabDTO(DTO):
    """Tab in a portable library document. Fields are grouped by responsibility."""

    id: str
    content: TransferTabContentDTO
    annotations: TransferTabAnnotationsDTO = Field(default_factory=TransferTabAnnotationsDTO)
    placement: TransferTabPlacementDTO = Field(default_factory=TransferTabPlacementDTO)
    lifecycle: TransferTabLifecycleDTO = Field(default_factory=TransferTabLifecycleDTO)
    timestamps: TransferTabTimestampsDTO = Field(default_factory=TransferTabTimestampsDTO)


class TransferDocumentLibraryDTO(DTO):
    """Library fields for TransferDocumentDTO."""

    tags: list[TransferTagDTO] = Field(default_factory=list)
    groups: list[TransferGroupDTO] = Field(default_factory=list)
    tabs: list[TransferTabDTO] = Field(default_factory=list)


class TransferDocumentDTO(DTO):
    """Complete schema-v5 portable library document. Fields are grouped by responsibility."""

    schema_version: Literal[5] = 5
    exported_at: datetime | None = None
    property_schema: dict[str, Any] = Field(default_factory=dict)
    library: TransferDocumentLibraryDTO = Field(default_factory=TransferDocumentLibraryDTO)

    @field_validator("property_schema")
    @classmethod
    def validated_definitions(cls, value: dict[str, Any]) -> dict[str, Any]:
        """Validate each keyed definition before an import can stage writes.

        Args:
            value (dict[str, Any]): Names mapped to complete definitions.

        Returns:
            dict[str, Any]: Validated definitions with normalized optional descriptions.
        """
        definitions = {}
        for name, definition in value.items():
            if not isinstance(definition, dict):
                raise ValueError("Property definitions must be objects")
            definitions[name] = PropertyDefinitionDTO.model_validate(
                {**definition, "name": name}
            ).model_dump(exclude={"name"})
        return definitions


class MinimalTransferTabContentDTO(BaseModel):
    """Content fields for MinimalTransferTabDTO."""

    url: str
    title: str
    model_config = model_config()


class MinimalTransferTabAnnotationsDTO(BaseModel):
    """Annotations fields for MinimalTransferTabDTO."""

    tags: list[str]
    model_config = model_config()


class MinimalTransferTabPlacementDTO(BaseModel):
    """Placement fields for MinimalTransferTabDTO."""

    group_id: str | None = None
    model_config = model_config()


class MinimalTransferTabDTO(BaseModel):
    """Minimal portable tab projection. Fields are grouped by responsibility."""

    id: str
    model_config = model_config()
    content: MinimalTransferTabContentDTO
    annotations: MinimalTransferTabAnnotationsDTO
    placement: MinimalTransferTabPlacementDTO = Field(
        default_factory=MinimalTransferTabPlacementDTO
    )


class MinimalTransferDocumentLibraryDTO(DTO):
    """Library fields for MinimalTransferDocumentDTO."""

    tags: list[TransferTagDTO]
    groups: list[TransferGroupDTO]
    tabs: list[MinimalTransferTabDTO]


class MinimalTransferDocumentDTO(DTO):
    """Portable document with minimal tab fields. Fields are grouped by responsibility."""

    schema_version: Literal[5] = 5
    exported_at: datetime | None = None
    property_schema: dict[str, Any] = Field(default_factory=dict)
    library: MinimalTransferDocumentLibraryDTO


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
