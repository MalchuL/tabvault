"""Define typed HTTP and MCP contracts for the TabVault bridge."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Generic, Literal, TypeAlias, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    field_serializer,
    field_validator,
)
from pydantic.alias_generators import to_camel

DataT = TypeVar("DataT")
MetaT = TypeVar("MetaT")
ItemT = TypeVar("ItemT")
SearchMode: TypeAlias = Literal["semantic", "keyword", "hybrid"]
TabVisibility: TypeAlias = Literal["visible", "hidden", "archived"]
TabSortBy: TypeAlias = Literal["position", "createdAt", "updatedAt", "title"]
SortDirection: TypeAlias = Literal["asc", "desc"]
ReceivedValue: TypeAlias = str | int | float | bool | None


def utc_datetime(value: datetime) -> datetime:
    """Treat a naive instant as UTC and convert an aware instant to UTC.

    The TabVault API persists UTC in SQLite, which drops timezone metadata. MCP hosts then reject
    structured tool output because JSON Schema ``date-time`` requires an offset.

    Args:
        value: Instant received from the API or constructed in process.

    Returns:
        datetime: The same instant with an explicit UTC timezone.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def rfc3339_utc(value: datetime) -> str:
    """Serialize a datetime as an RFC 3339 UTC instant with a trailing ``Z``.

    Args:
        value: Instant to serialize. Naive values are interpreted as UTC.

    Returns:
        str: RFC 3339 timestamp ending in ``Z``.
    """
    return utc_datetime(value).isoformat().replace("+00:00", "Z")


class DTO(BaseModel):
    """Provide strict camelCase serialization for every bridge contract."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    @field_validator("*", mode="after")
    @classmethod
    def naive_datetimes_are_utc(cls, value: object) -> object:
        """Attach UTC to naive timestamps so structured output stays RFC 3339.

        Args:
            value: Validated field value, which may be a datetime or any other DTO field.

        Returns:
            object: A UTC-aware datetime when the field is a timestamp, otherwise ``value``.
        """
        if isinstance(value, datetime):
            return utc_datetime(value)
        return value

    @field_serializer("*", when_used="json", mode="wrap")
    def serialize_rfc3339_datetimes(
        self, value: object, handler: SerializerFunctionWrapHandler
    ) -> object:
        """Emit RFC 3339 UTC timestamps with a trailing ``Z``.

        MCP Inspector and other hosts validate structured output against the generated JSON
        Schema. Naive ``isoformat()`` values omit a timezone and fail ``format: date-time``.

        Args:
            value: Field value being serialized to JSON.
            handler: Default Pydantic serializer for non-datetime fields.

        Returns:
            object: An RFC 3339 string for datetimes, otherwise the default JSON value.
        """
        if isinstance(value, datetime):
            return rfc3339_utc(value)
        return handler(value)


class WarningDTO(DTO):
    """Describe one non-fatal API warning."""

    code: str
    path: str
    message: str


class IssueDTO(WarningDTO):
    """Describe one structured API validation or domain issue."""

    expected: str
    received: ReceivedValue = None
    http_status: int
    suggested_fix: str | None = None


class FailureResponseDTO(DTO):
    """Represent an unsuccessful API response."""

    success: bool = False
    errors: list[IssueDTO]
    warnings: list[WarningDTO] = Field(default_factory=list[WarningDTO])


class SuccessResponseDTO(DTO, Generic[DataT, MetaT]):
    """Represent one successful API response with typed data and metadata."""

    success: bool = True
    data: DataT
    meta: MetaT | None = Field(default=None, exclude_if=lambda value: value is None)
    warnings: list[WarningDTO] | None = Field(default=None, exclude_if=lambda value: value is None)
    errors: list[IssueDTO] | None = Field(default=None, exclude_if=lambda value: value is None)


class PaginatedResponseDTO(DTO, Generic[ItemT]):
    """Represent an offset-paginated API collection."""

    data: list[ItemT]
    has_next: bool = False
    size: int = 0
    total: int = 0


class TabListQueryDTO(DTO):
    """Describe filters accepted by the Saved Tab collection endpoint."""

    group_id: str = "all"
    category: str | None = None
    tags: str = ""
    search: str | None = None
    sort_by: TabSortBy = "position"
    sort_dir: SortDirection = "asc"
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    fields: str = "full"
    visibility: TabVisibility = "visible"


class SearchQueryDTO(DTO):
    """Describe one semantic, keyword, or hybrid Saved Tab search."""

    q: str = Field(min_length=1)
    mode: SearchMode = "hybrid"
    limit: int = Field(default=10, ge=1, le=50)
    group_id: str | None = None


class GroupListQueryDTO(DTO):
    """Describe filters accepted by the Group collection endpoint."""

    visibility: Literal["visible", "hidden"] = "visible"
    category: str | None = None
    limit: int = Field(default=100, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class GroupTabsQueryDTO(DTO):
    """Describe a visibility-aware Saved Tab query within one Group."""

    visibility: TabVisibility = "visible"
    fields: str = "full"
    limit: int = Field(default=100, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class TagListQueryDTO(DTO):
    """Describe pagination for the Tag collection endpoint."""

    limit: int = Field(default=100, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class TabCreateDTO(DTO):
    """Describe one Saved Tab occurrence to create."""

    url: str = Field(min_length=1, max_length=4096)
    title: str | None = Field(default=None, max_length=1024)
    note: str = Field(default="", max_length=20_000)
    agent_review: str = Field(default="", max_length=20_000)
    viewed: bool = False
    tags: list[str] = Field(default_factory=list, max_length=64)
    group_id: str | None = Field(default=None, max_length=128)


class TabUpdateDTO(DTO):
    """Describe explicitly supplied Saved Tab fields to patch."""

    url: str | None = Field(default=None, min_length=1, max_length=4096)
    title: str | None = Field(default=None, min_length=1, max_length=1024)
    note: str | None = Field(default=None, max_length=20_000)
    agent_review: str | None = Field(default=None, max_length=20_000)
    viewed: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=64)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    hidden_until: datetime | None = None


class TabReorderDTO(DTO):
    """Describe one ordered subset of Saved Tabs in a membership scope."""

    group_id: str | None = Field(default=None, max_length=128)
    tab_ids: list[str]

    @field_validator("tab_ids")
    @classmethod
    def tab_ids_are_unique(cls, value: list[str]) -> list[str]:
        """Reject ambiguous orders containing duplicate identifiers."""
        if len(value) != len(set(value)):
            raise ValueError("tabIds must not contain duplicates")
        return value


class TabTagDTO(DTO):
    """Describe one tag attachment request."""

    tag_name: str = Field(min_length=1, max_length=256)


class GroupCreateDTO(DTO):
    """Describe one Manual Group to create."""

    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="manual", min_length=1, max_length=128)
    description: str = Field(default="", max_length=20_000)
    color: str | None = Field(default=None, max_length=32)


class GroupUpdateDTO(DTO):
    """Describe explicitly supplied Group fields to patch."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=20_000)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)


class TabDTO(DTO):
    """Represent one complete Saved Tab returned by the API."""

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


class TabProjectionDTO(DTO):
    """Represent a caller-selected subset of Saved Tab fields."""

    id: str | None = Field(default=None, exclude_if=lambda value: value is None)
    url: str | None = Field(default=None, exclude_if=lambda value: value is None)
    title: str | None = Field(default=None, exclude_if=lambda value: value is None)
    favicon: str | None = Field(default=None, exclude_if=lambda value: value is None)
    note: str | None = Field(default=None, exclude_if=lambda value: value is None)
    agent_review: str | None = Field(default=None, exclude_if=lambda value: value is None)
    viewed: bool | None = Field(default=None, exclude_if=lambda value: value is None)
    tags: list[str] | None = Field(default=None, exclude_if=lambda value: value is None)
    group_id: str | None = Field(default=None, exclude_if=lambda value: value is None)
    position: float | None = Field(default=None, exclude_if=lambda value: value is None)
    archived: bool | None = Field(default=None, exclude_if=lambda value: value is None)
    archived_at: datetime | None = Field(default=None, exclude_if=lambda value: value is None)
    hidden_until: datetime | None = Field(default=None, exclude_if=lambda value: value is None)
    created_at: datetime | None = Field(default=None, exclude_if=lambda value: value is None)
    updated_at: datetime | None = Field(default=None, exclude_if=lambda value: value is None)


class TabJobDTO(DTO):
    """Identify one preview job created with a Saved Tab."""

    tab_id: str
    job_id: str


class TabCreateMetaDTO(DTO):
    """Expose preview-job metadata returned by Saved Tab creation."""

    job: TabJobDTO


class TabDeleteResultDTO(DTO):
    """Describe an archived or permanently deleted Saved Tab."""

    id: str
    deleted_at: datetime
    hard: bool


class TabReorderResultDTO(DTO):
    """Confirm one accepted Saved Tab order."""

    group_id: str | None
    tab_ids: list[str]


class GroupDTO(DTO):
    """Represent one visible flat Group."""

    id: str
    name: str
    category: str
    description: str
    color: str | None
    position: float
    created_at: datetime
    updated_at: datetime
    tab_count: int = 0


class GroupDeleteResultDTO(DTO):
    """Describe permanent Group deletion and archived members."""

    id: str
    archived_tab_count: int
    deleted_at: datetime


class TagDTO(DTO):
    """Represent one tag and its usage count."""

    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    tab_count: int


class SearchItemDTO(DTO):
    """Represent one scored Saved Tab search result."""

    tab: TabDTO
    score: float
    match_type: Literal["both", "semantic", "keyword"]
    matched_on: Literal["title", "url", "note", "agentReview", "tags", "semantic"]


class SearchDataDTO(DTO):
    """Contain scored Saved Tab search results."""

    results: list[SearchItemDTO]


class SearchMetaDTO(DTO):
    """Report search timing metadata in milliseconds."""

    query_embedding_ms: int
    search_ms: int


class TabByUrlResultDTO(DTO):
    """Wrap the first exact URL match for MCP structured output."""

    result: TabDTO | None


class TabsByUrlResultDTO(DTO):
    """Wrap all exact URL matches for MCP structured output."""

    result: list[TabDTO]


class UrlBulkErrorDTO(DTO):
    """Describe one failed member of a best-effort URL mutation."""

    tab_id: str
    message: str


class UrlBulkResultDTO(DTO):
    """Describe successes and failures from a best-effort URL mutation."""

    matched: int
    data: list[TabDTO]
    errors: list[UrlBulkErrorDTO]


TabListResponseDTO = PaginatedResponseDTO[TabDTO | TabProjectionDTO]
GroupListResponseDTO = PaginatedResponseDTO[GroupDTO]
TagListResponseDTO = PaginatedResponseDTO[TagDTO]
TabResponseDTO = SuccessResponseDTO[TabDTO, None]
TabCreateResponseDTO = SuccessResponseDTO[TabDTO, TabCreateMetaDTO]
TabDeleteResponseDTO = SuccessResponseDTO[TabDeleteResultDTO, None]
TabReorderResponseDTO = SuccessResponseDTO[TabReorderResultDTO, None]
GroupResponseDTO = SuccessResponseDTO[GroupDTO, None]
GroupDeleteResponseDTO = SuccessResponseDTO[GroupDeleteResultDTO, None]
SearchResponseDTO = SuccessResponseDTO[SearchDataDTO, SearchMetaDTO]
