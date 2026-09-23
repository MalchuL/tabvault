"""Captured preview and asset DTOs."""

from datetime import datetime
from pathlib import Path
from typing import Literal, TypeAlias

from pydantic import BaseModel

from lib.dto_config import DTO, model_config

PreviewStatus: TypeAlias = Literal["pending", "running", "ready", "unavailable"]
AssetKind: TypeAlias = Literal["image", "icon"]


class PreviewDTO(DTO):
    """Captured preview content or pending state."""

    tab_id: str
    status: PreviewStatus
    title: str | None = None
    byline: str | None = None
    site_name: str | None = None
    excerpt: str | None = None
    content_html: str | None = None
    length: int | None = None
    source_url: str | None = None
    error: str | None = None
    fetched_at: datetime | None = None
    fallback_asset: str


class AssetFileDTO(BaseModel):
    """Asset file ready for an HTTP file response."""

    path: Path
    media_type: str
    model_config = model_config()


class ExtractedArticleDTO(BaseModel):
    """Sanitized article fields extracted from HTML."""

    title: str | None
    byline: str | None
    site_name: str | None
    excerpt: str | None
    content_html: str
    length: int
    model_config = model_config()


class PreviewCaptureResultDTO(BaseModel):
    """Outcome of a background preview capture."""

    tab_id: str | None = None
    status: PreviewStatus | None = None
    skipped: Literal["tab_not_found"] | None = None
    error: str | None = None
    model_config = model_config()
