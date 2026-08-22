"""Typed requests and results for group use cases."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, TypeAlias

from pydantic import BaseModel, Field

from lib.dto_config import model_config

GroupDeleteStrategy: TypeAlias = Literal["cascade", "promote", "reject_if_nonempty"]


class GroupCreateDTO(BaseModel):
    """Describe a group to create."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default="", max_length=20_000)
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
    """Describe fields that may be changed on a group."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    parent_id: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=32)
    position: float | None = Field(default=None, ge=0)
    model_config = model_config()


class GroupDTO(BaseModel):
    """Represent a group, optionally with nested children."""

    id: str
    name: str
    description: str = ""
    parent_id: str | None
    color: str | None
    position: float
    created_at: datetime
    updated_at: datetime
    tab_count: int = 0
    total_tab_count: int | None = None
    children: list[GroupDTO] | None = None
    model_config = model_config()


class GroupListDataDTO(BaseModel):
    """Expose groups in an API data envelope."""

    groups: list[GroupDTO]
    model_config = model_config()


class GroupDeleteResultDTO(BaseModel):
    """Describe the result of deleting a group."""

    id: str
    strategy: GroupDeleteStrategy
    deleted_at: datetime
    model_config = model_config()
