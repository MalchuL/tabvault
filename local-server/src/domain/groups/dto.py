"""Typed requests and results for flat Group use cases."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import model_config


class GroupCreateDTO(BaseModel):
    """Describe one Group to create."""

    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default="", max_length=20_000)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    id: str | None = Field(default=None, max_length=128)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = model_config()


class GroupUpdateDTO(BaseModel):
    """Describe explicitly supplied Group fields."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=20_000)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    model_config = model_config()


class GroupDTO(BaseModel):
    """Represent one flat Group."""

    id: str
    name: str
    category: str
    description: str
    color: str | None
    position: float
    created_at: datetime
    updated_at: datetime
    tab_count: int = 0
    model_config = model_config()


class GroupListDataDTO(BaseModel):
    """Expose Groups in the common API envelope."""

    groups: list[GroupDTO]
    model_config = model_config()


class GroupDeleteResultDTO(BaseModel):
    """Describe permanent Group deletion and archived members."""

    id: str
    archived_tab_count: int
    deleted_at: datetime
    model_config = model_config()
