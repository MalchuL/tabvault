"""Typed requests and results for Saved Tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, TypeAlias
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

from lib.dto_config import model_config
from lib.responses import WarningDTO
from lib.time import absolute_utc

from .visibility import TabVisibility

TabSortBy: TypeAlias = Literal["position", "createdAt", "updatedAt", "title"]
SortDirection: TypeAlias = Literal["asc", "desc"]


def _validate_saved_url(value: str) -> str:
    """Validate an HTTP(S) URL without changing its original representation."""
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be an absolute HTTP or HTTPS URL")
    return value


class TabCreateDTO(BaseModel):
    """Describe one Saved Tab occurrence to create."""

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


class TabListOptionsDTO(BaseModel):
    """Collect filters and cursor options for a Saved Tab list."""

    group_id: str | None = "all"
    category: str | None = None
    tags_any: list[str] = Field(default_factory=list)
    tags_all: list[str] = Field(default_factory=list)
    search: str | None = None
    sort_by: TabSortBy = "position"
    sort_dir: SortDirection = "asc"
    limit: int = Field(default=50, ge=1)
    requested_limit: int = Field(default=50, ge=1)
    cursor: str | None = None
    fields: str = "full"
    visibility: TabVisibility = "visible"
    model_config = model_config()


class TabUpdateDTO(BaseModel):
    """Describe explicitly supplied Saved Tab fields."""

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
        """Require an absolute instant and normalize it to UTC."""
        if value is None:
            return None
        return absolute_utc(value)


class TabTagDTO(BaseModel):
    """Describe a tag to attach to one Saved Tab."""

    tag_name: str = Field(min_length=1, max_length=256)
    model_config = model_config()


class TabDTO(BaseModel):
    """Represent one complete Saved Tab."""

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
    """Represent a caller-selected subset of Saved Tab fields."""

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
    """Identify the preview job created for a Saved Tab."""

    tab_id: str
    job_id: str
    model_config = model_config()


class TabCreateMetaDTO(BaseModel):
    """Expose the preview job queued by creation."""

    job: TabJobDTO
    model_config = model_config()


class TabListMetaDTO(BaseModel):
    """Describe cursor pagination."""

    next_cursor: str | None
    has_more: bool
    total_count: int
    model_config = model_config()


class TabListResultDTO(BaseModel):
    """Contain a projected page and metadata."""

    tabs: list[TabDTO | TabProjectionDTO]
    meta: TabListMetaDTO
    warnings: list[WarningDTO]
    model_config = model_config()


class TabListDataDTO(BaseModel):
    """Expose Saved Tabs in the common API envelope."""

    tabs: list[TabDTO | TabProjectionDTO]
    model_config = model_config()


class TabDeleteResultDTO(BaseModel):
    """Describe an archived or permanently deleted Saved Tab."""

    id: str
    deleted_at: datetime
    hard: bool
    model_config = model_config()
