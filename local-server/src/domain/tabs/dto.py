"""Typed requests and results for Saved Tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, TypeAlias
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

from lib.dto_config import DTO, model_config
from lib.pagination import PaginatedResponse

from .visibility import TabVisibility

TabSortBy: TypeAlias = Literal["position", "createdAt", "updatedAt", "title"]
SortDirection: TypeAlias = Literal["asc", "desc"]


def _validate_saved_url(value: str) -> str:
    """Validate an HTTP(S) URL without changing its original representation.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Args:
        value (str): URL supplied for a saved tab.

    Returns:
        str: Original URL after confirming it uses HTTP or HTTPS.

    Raises:
        ValueError: The URL lacks an HTTP(S) scheme or network location.
    """
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be an absolute HTTP or HTTPS URL")
    return value


class TabCreateDTO(BaseModel):
    """Describe one Saved Tab occurrence to create.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        url (str): Original saved URL, preserved without canonicalization.
        title (str | None): Human-readable title.
        note (str | None): User-authored note stored with the Saved Tab.
        agent_review (str | None): Agent-authored review text stored with the Saved Tab.
        custom_properties (dict[str, Any]): Explicit schema-defined values supplied on creation.
        tags (list[str]): Tags names associated with the Saved Tab.
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        position (float | None): Stable display position within the current Group or Unassigned
            section.
        id (str | None): Stable identifier for this record.
    """

    url: str = Field(min_length=1, max_length=4096)
    title: str | None = Field(default=None, max_length=1024)
    note: str | None = Field(default="", max_length=20_000)
    agent_review: str | None = Field(default="", max_length=20_000)
    custom_properties: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list, max_length=64)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    id: str | None = Field(default=None, max_length=128)
    model_config = model_config()

    _url_is_http = field_validator("url")(_validate_saved_url)


class TabBatchCreateDTO(BaseModel):
    """Describe an atomic batch of distinct Saved Tab occurrences.

    Browser capture uses this command to persist one Session's tabs in a single transaction while
    preserving a separate identity and preview job for every occurrence. Validation rejects empty
    and unbounded batches before the service opens a transaction.

    Attributes:
        tabs (list[TabCreateDTO]): One to one thousand occurrences to create atomically, in display
            order.
    """

    tabs: list[TabCreateDTO] = Field(min_length=1, max_length=1000)
    model_config = model_config()


class TabListOptionsDTO(BaseModel):
    """Collect filters and projection options for a Saved Tab list.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        category (str | None): Free-form Group category, such as ``session`` or ``manual``.
        tags_any (list[str]): Tag names of which matching tabs need at least one.
        tags_all (list[str]): Tag names all matching tabs must have.
        search (str | None): Optional text filter for saved tabs.
        sort_by (TabSortBy): Saved-tab field used for sorting.
        sort_dir (SortDirection): Ascending or descending sort direction.
        fields (str): Comma-separated projection fields requested by the caller.
        visibility (TabVisibility): Visible, hidden, or archived tab scope.
    """

    group_id: str | None = "all"
    category: str | None = None
    tags_any: list[str] = Field(default_factory=list)
    tags_all: list[str] = Field(default_factory=list)
    search: str | None = None
    sort_by: TabSortBy = "position"
    sort_dir: SortDirection = "asc"
    fields: str = "full"
    visibility: TabVisibility = "visible"
    model_config = model_config()


class TabUpdateDTO(DTO):
    """Describe explicitly supplied Saved Tab fields.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        url (str | None): Original saved URL, preserved without canonicalization.
        title (str | None): Human-readable title.
        note (str | None): User-authored note stored with the Saved Tab.
        agent_review (str | None): Agent-authored review text stored with the Saved Tab.
        custom_properties (dict[str, Any] | None): Explicit values to merge atomically.
        tags (list[str] | None): Tags names associated with the Saved Tab.
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        position (float | None): Stable display position within the current Group or Unassigned
            section.
        archived (bool | None): Whether the record is outside the active library.
        hidden_until (datetime | None): Absolute UTC deadline before which the tab stays hidden.
    """

    url: str | None = Field(default=None, min_length=1, max_length=4096)
    title: str | None = Field(default=None, min_length=1, max_length=1024)
    note: str | None = Field(default=None, max_length=20_000)
    agent_review: str | None = Field(default=None, max_length=20_000)
    custom_properties: dict[str, Any] | None = None
    tags: list[str] | None = Field(default=None, max_length=64)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    archived: bool | None = None
    hidden_until: datetime | None = None

    _url_is_http = field_validator("url")(
        lambda value: _validate_saved_url(value) if value is not None else value
    )


class TabReorderDTO(BaseModel):
    """Describe one ordered subset of active tabs in a single membership scope.

    The client sends IDs from first to last for one persisted Group or for Unassigned. Tabs omitted
    because they were concurrently created or hidden retain their relative order after the supplied
    IDs, so a reorder never deletes or strands records that the caller did not load.

    Attributes:
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        tab_ids (list[str]): Unique active Saved Tab IDs in their desired relative order.
    """

    group_id: str | None = Field(default=None, max_length=128)
    tab_ids: list[str]
    model_config = model_config()

    @field_validator("tab_ids")
    @classmethod
    def tab_ids_are_unique(cls, value: list[str]) -> list[str]:
        """Reject ambiguous orders containing the same Saved Tab more than once.

        Args:
            value (list[str]): Caller-supplied IDs in the desired relative order.

        Returns:
            list[str]: The unchanged order when every identifier is unique.

        Raises:
            ValueError: At least one Saved Tab identifier occurs more than once.
        """
        if len(value) != len(set(value)):
            raise ValueError("tabIds must not contain duplicates")
        return value


class TabReorderResultDTO(BaseModel):
    """Confirm the ordered IDs accepted for one membership scope.

    Attributes:
        group_id (str | None): Group whose positions changed, or ``None`` for Unassigned.
        tab_ids (list[str]): Caller-supplied IDs whose relative order was applied.
    """

    group_id: str | None
    tab_ids: list[str]
    model_config = model_config()


class TabTagDTO(BaseModel):
    """Describe a tag to attach to one Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tag_name (str): Name of the tag to attach or remove.
    """

    tag_name: str = Field(min_length=1, max_length=256)
    model_config = model_config()


class TabDTO(DTO):
    """Represent one complete Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        url (str): Original saved URL, preserved without canonicalization.
        title (str): Human-readable title.
        favicon (str | None): Favicon URL or asset reference when available.
        note (str): User-authored note stored with the Saved Tab.
        agent_review (str): Agent-authored review text stored with the Saved Tab.
        custom_properties (dict[str, Any]): Resolved declared values, including defaults.
        tags (list[str]): Tags associated with the Saved Tab.
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        position (float): Stable display position within the current Group or Unassigned section.
        archived (bool): Whether the record is outside the active library.
        archived_at (datetime | None): UTC instant at which the record entered the archive.
        hidden_until (datetime | None): Absolute UTC deadline before which the tab stays hidden.
        created_at (datetime): UTC instant at which the record was created.
        updated_at (datetime): UTC instant at which the record was last changed.
    """

    id: str
    url: str
    title: str
    favicon: str | None
    note: str
    agent_review: str
    custom_properties: dict[str, Any]
    tags: list[str]
    group_id: str | None
    position: float
    archived: bool
    archived_at: datetime | None
    hidden_until: datetime | None
    created_at: datetime
    updated_at: datetime


class TabProjectionDTO(DTO):
    """Represent a caller-selected subset of Saved Tab fields.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str | None): Stable identifier for this record.
        url (str | None): Original saved URL, preserved without canonicalization.
        title (str | None): Human-readable title.
        favicon (str | None): Favicon URL or asset reference when available.
        note (str | None): User-authored note stored with the Saved Tab.
        agent_review (str | None): Agent-authored review text stored with the Saved Tab.
        custom_properties (dict[str, Any] | None): Resolved declared property values.
        tags (list[str] | None): Tags associated with the Saved Tab.
        group_id (str | None): Identifier of the containing Group, or ``None`` for Unassigned.
        position (float | None): Stable display position within the current Group or Unassigned
            section.
        archived (bool | None): Whether the record is outside the active library.
        archived_at (datetime | None): UTC instant at which the record entered the archive.
        hidden_until (datetime | None): Absolute UTC deadline before which the tab stays hidden.
        created_at (datetime | None): UTC instant at which the record was created.
        updated_at (datetime | None): UTC instant at which the record was last changed.
    """

    id: str | None = None
    url: str | None = None
    title: str | None = None
    favicon: str | None = None
    note: str | None = None
    agent_review: str | None = None
    custom_properties: dict[str, Any] | None = None
    tags: list[str] | None = None
    group_id: str | None = None
    position: float | None = None
    archived: bool | None = None
    archived_at: datetime | None = None
    hidden_until: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TabJobDTO(BaseModel):
    """Identify the preview job created for a Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        tab_id (str): Stable identifier of the related tab.
        job_id (str): Stable identifier of the related job.
    """

    tab_id: str
    job_id: str
    model_config = model_config()


class TabCreateMetaDTO(BaseModel):
    """Expose the preview job queued by creation.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        job (TabJobDTO): Background job created for preview capture.
    """

    job: TabJobDTO
    model_config = model_config()


class TabBatchCreateMetaDTO(BaseModel):
    """Expose preview jobs queued by one atomic batch creation.

    The job order matches the returned Saved Tab order so clients can correlate asynchronous
    preview work without issuing per-tab creation requests.

    Attributes:
        jobs (list[TabJobDTO]): Preview jobs created in the same transaction as the Saved Tabs.
    """

    jobs: list[TabJobDTO]
    model_config = model_config()


class TabListResponseDTO(PaginatedResponse[TabDTO | TabProjectionDTO]):
    """Expose a paginated list of Saved Tabs."""


class TabDeleteResultDTO(DTO):
    """Describe an archived or permanently deleted Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        deleted_at (datetime): UTC instant associated with deleted.
        hard (bool): Whether deletion removes the archived record permanently.
    """

    id: str
    deleted_at: datetime
    hard: bool
