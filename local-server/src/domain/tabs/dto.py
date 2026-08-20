from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from lib.dto_config import model_config


class TabCreateDTO(BaseModel):
    url: str = Field(min_length=1, max_length=4096)
    title: str | None = Field(default=None, max_length=1024)
    favicon: str | None = Field(default=None, max_length=4096)
    note: str | None = Field(default=None, max_length=20_000)
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
    tabs: list[dict[str, Any]] = Field(min_length=1, max_length=1000)
    dedupe: bool = True
    dedupe_strategy: Literal["skip", "merge", "createAnyway"] = "skip"
    model_config = model_config()


class TabUpdateDTO(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=1024)
    note: str | None = Field(default=None, max_length=20_000)
    tags: list[str] | None = Field(default=None, max_length=64)
    favicon: str | None = Field(default=None, max_length=4096)
    group_id: str | None = Field(default=None, max_length=128)
    position: float | None = Field(default=None, ge=0)
    archived: bool | None = None
    archived_at: datetime | None = None
    model_config = model_config()


class TabMoveDTO(BaseModel):
    target_group_id: str | None = Field(default=None, max_length=128)
    position: int | None = Field(default=None, ge=0)
    model_config = model_config()


class BatchDeleteDTO(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)
    hard: bool = False
    model_config = model_config()


class TabRestoreDTO(TabCreateDTO):
    id: str = Field(min_length=1, max_length=128)


class TabDTO(BaseModel):
    id: str
    url: str
    title: str
    favicon: str | None
    note: str | None
    tags: list[str]
    group_id: str | None
    position: float
    archived: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = model_config()
