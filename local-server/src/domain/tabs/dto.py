"""Typed requests and results for Saved Tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, TypeAlias
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

from lib.dto_config import model_config
from lib.pagination import PaginatedResponse
from lib.time import absolute_utc

from .visibility import TabVisibility

TabSortBy: TypeAlias = Literal["position", "createdAt", "updatedAt", "title"]
SortDirection: TypeAlias = Literal["asc", "desc"]


def _validate_saved_url(value: str) -> str:
    """Validate an HTTP(S) URL without changing its original representation.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Args:
        value (str): Value to validate, convert, or persist.

    Returns:
        str: Result produced by the operation described above.

    Raises:
        ValueError: Propagated when its documented validation or operation condition occurs.
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
        viewed (bool): Whether any equivalent occurrence has been viewed.
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
    viewed: bool = False
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
        tags_any (list[str]): Typed tags any value carried by this object.
        tags_all (list[str]): Typed tags all value carried by this object.
        search (str | None): Typed search value carried by this object.
        sort_by (TabSortBy): Typed sort by value carried by this object.
        sort_dir (SortDirection): Typed sort dir value carried by this object.
        fields (str): Typed fields value carried by this object.
        visibility (TabVisibility): Typed visibility value carried by this object.
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


class TabUpdateDTO(BaseModel):
    """Describe explicitly supplied Saved Tab fields.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        url (str | None): Original saved URL, preserved without canonicalization.
        title (str | None): Human-readable title.
        note (str | None): User-authored note stored with the Saved Tab.
        agent_review (str | None): Agent-authored review text stored with the Saved Tab.
        viewed (bool | None): Whether any equivalent occurrence has been viewed.
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
    viewed: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=64)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    archived: bool | None = None
    hidden_until: datetime | None = None
    model_config = model_config()

    _url_is_http = field_validator("url")(
        lambda value: _validate_saved_url(value) if value is not None else value
    )

    @field_validator("hidden_until")
    @classmethod
    def hidden_until_is_utc(cls, value: datetime | None) -> datetime | None:
        """Require an absolute instant and normalize it to UTC.

        This type is part of a validated boundary: Pydantic enforces its declared shape while the
        shared DTO configuration serializes public field names in camelCase and rejects unknown
        input fields.

        Args:
            value (datetime | None): Value to validate, convert, or persist.

        Returns:
            datetime | None: Result produced by the operation described above.
        """
        if value is None:
            return None
        return absolute_utc(value)


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
        tag_name (str): Typed tag name value carried by this object.
    """

    tag_name: str = Field(min_length=1, max_length=256)
    model_config = model_config()


class TabDTO(BaseModel):
    """Represent one complete Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        url (str): Original saved URL, preserved without canonicalization.
        title (str): Human-readable title.
        favicon (str | None): Typed favicon value carried by this object.
        note (str): User-authored note stored with the Saved Tab.
        agent_review (str): Agent-authored review text stored with the Saved Tab.
        viewed (bool): Whether any equivalent occurrence has been viewed.
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
    viewed: bool
    tags: list[str]
    group_id: str | None
    position: float
    archived: bool
    archived_at: datetime | None
    hidden_until: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = model_config()


class TabProjectionDTO(BaseModel):
    """Represent a caller-selected subset of Saved Tab fields.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str | None): Stable identifier for this record.
        url (str | None): Original saved URL, preserved without canonicalization.
        title (str | None): Human-readable title.
        favicon (str | None): Typed favicon value carried by this object.
        note (str | None): User-authored note stored with the Saved Tab.
        agent_review (str | None): Agent-authored review text stored with the Saved Tab.
        viewed (bool | None): Whether any equivalent occurrence has been viewed.
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
    viewed: bool | None = None
    tags: list[str] | None = None
    group_id: str | None = None
    position: float | None = None
    archived: bool | None = None
    archived_at: datetime | None = None
    hidden_until: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = model_config()


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
        job (TabJobDTO): Typed job value carried by this object.
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


class TabDeleteResultDTO(BaseModel):
    """Describe an archived or permanently deleted Saved Tab.

    This type is part of a validated boundary: Pydantic enforces its declared shape while the shared
    DTO configuration serializes public field names in camelCase and rejects unknown input fields.

    Attributes:
        id (str): Stable identifier for this record.
        deleted_at (datetime): UTC instant associated with deleted.
        hard (bool): Typed hard value carried by this object.
    """

    id: str
    deleted_at: datetime
    hard: bool
    model_config = model_config()
