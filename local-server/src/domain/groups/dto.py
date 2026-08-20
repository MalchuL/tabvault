from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import model_config


class GroupCreateDTO(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    id: str | None = Field(default=None, max_length=128)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    archived: bool = False
    archived_at: datetime | None = None
    model_config = model_config()


class GroupUpdateDTO(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    model_config = model_config()


class GroupDTO(BaseModel):
    id: str
    name: str
    parent_id: str | None
    color: str | None
    position: float
    created_at: datetime
    updated_at: datetime
    tab_count: int = 0
    total_tab_count: int | None = None
    children: list[GroupDTO] | None = None
    model_config = model_config()
