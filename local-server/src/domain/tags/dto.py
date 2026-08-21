"""Typed requests and results for tag use cases."""

from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import model_config


class TagUpsertDTO(BaseModel):
    """Describe mutable tag metadata."""

    description: str | None = Field(default=None, max_length=4096)
    model_config = model_config()


class TagDTO(BaseModel):
    """Represent a tag and its usage count."""

    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    tab_count: int
    model_config = model_config()


class TagListDataDTO(BaseModel):
    """Expose tags in an API data envelope."""

    tags: list[TagDTO]
    model_config = model_config()


class TagDeleteResultDTO(BaseModel):
    """Describe a deleted tag and detached tab count."""

    name: str
    detached_from_tabs: int
    model_config = model_config()
