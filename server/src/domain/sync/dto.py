"""Versioned synchronization boundary and acknowledgements."""

from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from domain.transfer.dto import TransferDocumentDTO
from lib.dto_config import DTO

ResourceKind = Literal["tab", "group", "tag", "property"]


class ChangeDTO(DTO):
    """A complete resource value or a deletion, identified by a client change token."""

    kind: ResourceKind
    id: str = Field(min_length=1, max_length=256)
    token: str = Field(min_length=1, max_length=128)
    updated_at: datetime
    data: dict[str, Any] | None

    @field_validator("updated_at", mode="before")
    @classmethod
    def timezone_required(cls, value: Any) -> datetime:
        """Reject ambiguous timestamps before comparing changes.

        Args:
            value (Any): Raw client timestamp before legacy DTO normalization.

        Returns:
            datetime: Offset-aware input timestamp.

        Raises:
            ValueError: The timestamp has no UTC offset.
        """
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not isinstance(value, datetime) or value.tzinfo is None:
            raise ValueError("updatedAt must include a timezone")
        return value


class SyncRequestDTO(DTO):
    """One atomic set of pending mutations from a compatible client."""

    schema_version: Literal[5]
    generation: str | None = None
    changes: list[ChangeDTO] = Field(default_factory=list, max_length=10000)

    @model_validator(mode="after")
    def unique_changes(self) -> "SyncRequestDTO":
        """Reject duplicate resource keys or acknowledgement tokens.

        Returns:
            SyncRequestDTO: Unchanged request with unique changes.

        Raises:
            ValueError: A resource or token appears twice.
        """
        keys = [
            (change.kind, change.id.lower() if change.kind == "tag" else change.id)
            for change in self.changes
        ]
        if len(set(keys)) != len(keys) or len({c.token for c in self.changes}) != len(keys):
            raise ValueError("Changes must have unique resource identities and tokens")
        return self


class TombstoneDTO(DTO):
    """Deletion retained to prevent stale clients resurrecting data."""

    kind: ResourceKind
    id: str
    updated_at: datetime


class SyncResponseDTO(DTO):
    """Committed snapshot with exact submitted tokens safe to acknowledge."""

    generation: str
    document: TransferDocumentDTO
    acknowledged: list[str]
    property_times: dict[str, datetime]
    tombstones: list[TombstoneDTO]
