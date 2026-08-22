"""Typed requests and results for tab use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, TypeAlias

from pydantic import BaseModel, Field

from lib.dto_config import model_config
from lib.responses import IssueDTO, WarningDTO

DedupeStrategy: TypeAlias = Literal["skip", "merge", "createAnyway"]
TabSortBy: TypeAlias = Literal["position", "createdAt", "updatedAt", "title"]
SortDirection: TypeAlias = Literal["asc", "desc"]


class TabCreateDTO(BaseModel):
    """Describe one tab to create."""

    url: str = Field(min_length=1, max_length=4096)
    title: str | None = Field(default=None, max_length=1024)
    favicon: str | None = Field(default=None, max_length=4096)
    note: str | None = Field(default="", max_length=20_000)
    agent_review: str | None = Field(default="", max_length=20_000)
    viewed: bool = False
    tags: list[str] = Field(default_factory=list, max_length=64)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    id: str | None = Field(default=None, max_length=128)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    archived: bool = False
    archived_at: datetime | None = None
    model_config = model_config()


class TabBatchCreateDTO(BaseModel):
    """Describe a batch of tabs to create."""

    tabs: list[TabCreateDTO] = Field(min_length=1, max_length=1000)
    dedupe: bool = True
    dedupe_strategy: DedupeStrategy = "skip"
    model_config = model_config()


class TabListOptionsDTO(BaseModel):
    """Collect filters and cursor options for a tab list."""

    group_id: str | None = "all"
    group_ids: set[str] | None = None
    tags_any: list[str] = Field(default_factory=list)
    tags_all: list[str] = Field(default_factory=list)
    search: str | None = None
    sort_by: TabSortBy = "position"
    sort_dir: SortDirection = "asc"
    limit: int = Field(default=50, ge=1)
    requested_limit: int = Field(default=50, ge=1)
    cursor: str | None = None
    fields: str = "full"
    include_archived: bool = False
    model_config = model_config()


class TabUpdateDTO(BaseModel):
    """Describe fields that may be changed on a tab."""

    title: str | None = Field(default=None, min_length=1, max_length=1024)
    note: str | None = Field(default=None, max_length=20_000)
    agent_review: str | None = Field(default=None, max_length=20_000)
    viewed: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=64)
    favicon: str | None = Field(default=None, max_length=4096)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    archived: bool | None = None
    archived_at: datetime | None = None
    model_config = model_config()


class TabMoveDTO(BaseModel):
    """Describe a tab move within or between groups."""

    target_group_id: str | None = Field(default=None, max_length=128)
    position: int | None = Field(default=None, ge=0)
    model_config = model_config()


class BatchDeleteDTO(BaseModel):
    """Describe tabs to archive or permanently delete."""

    ids: list[str] = Field(min_length=1, max_length=1000)
    hard: bool = False
    model_config = model_config()


class TabTagDTO(BaseModel):
    """Describe a tag to attach to a tab."""

    tag_name: str = Field(min_length=1, max_length=256)
    model_config = model_config()


class TabRestoreDTO(TabCreateDTO):
    """Describe a tab restored from synchronized data."""

    id: str = Field(min_length=1, max_length=128)


class TabDTO(BaseModel):
    """Represent a complete tab response."""

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
    created_at: datetime
    updated_at: datetime
    model_config = model_config()


class TabProjectionDTO(BaseModel):
    """Represent a caller-selected subset of tab fields."""

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
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = model_config()


class TabCreatedDTO(TabDTO):
    """Describe a created tab and whether it matched an existing row."""

    was_duplicate: bool


class TabSkippedDTO(BaseModel):
    """Describe a tab skipped because it duplicated an existing row."""

    url: str
    existing_id: str
    reason: Literal["duplicate_url"]
    model_config = model_config()


class TabJobDTO(BaseModel):
    """Identify a background job created for a tab."""

    tab_id: str
    job_id: str
    model_config = model_config()


class TabCreateResultDTO(BaseModel):
    """Collect results from a batch tab creation request."""

    created: list[TabCreatedDTO]
    skipped: list[TabSkippedDTO]
    errors: list[IssueDTO]
    jobs: list[TabJobDTO]
    model_config = model_config()


class TabCreateDataDTO(BaseModel):
    """Expose created and duplicate-skipped tabs in the response body."""

    created: list[TabCreatedDTO]
    skipped: list[TabSkippedDTO]
    model_config = model_config()


class TabCreateMetaDTO(BaseModel):
    """Expose jobs queued by a tab creation request."""

    jobs: list[TabJobDTO]
    model_config = model_config()


class TabListMetaDTO(BaseModel):
    """Describe cursor pagination for a tab list."""

    next_cursor: str | None
    has_more: bool
    total_count: int
    model_config = model_config()


class TabListResultDTO(BaseModel):
    """Contain a projected page of tabs and its metadata."""

    tabs: list[TabDTO | TabProjectionDTO]
    meta: TabListMetaDTO
    warnings: list[WarningDTO]
    model_config = model_config()


class TabListDataDTO(BaseModel):
    """Expose a projected list of tabs in an API data envelope."""

    tabs: list[TabDTO | TabProjectionDTO]
    model_config = model_config()


class TabDeleteResultDTO(BaseModel):
    """Describe an archived or permanently deleted tab."""

    id: str
    deleted_at: datetime
    hard: bool
    model_config = model_config()


class TabBatchDeleteResultDTO(BaseModel):
    """Report successful and missing tab IDs from batch deletion."""

    deleted: list[str]
    not_found: list[str]
    model_config = model_config()


class TabRestoreResultDTO(BaseModel):
    """Report how many tabs were restored."""

    restored: int
    model_config = model_config()
