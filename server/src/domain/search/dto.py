"""Search request and result DTOs."""

from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field

from domain.tabs.dto import TabDTO
from lib.dto_config import model_config
from lib.responses import WarningDTO

PropertyFilterOperator: TypeAlias = Literal["eq", "ne", "gt", "gte", "lt", "lte"]
SearchMatchedOn: TypeAlias = Literal["title", "url", "tags", "customProperties"]


class PropertyFilterDTO(BaseModel):
    """One predicate over a resolved custom property."""

    name: str
    operator: PropertyFilterOperator
    value: Any
    model_config = model_config()


class StructuredSearchDTO(BaseModel):
    """Structured search input."""

    query: str = Field(min_length=1)
    property_filters: list[PropertyFilterDTO] = Field(default_factory=list, max_length=64)
    limit: int = Field(default=10, ge=1, le=50)
    group_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    model_config = model_config()


class SearchItemDTO(BaseModel):
    """One scored search result."""

    tab: TabDTO
    score: float
    matched_on: SearchMatchedOn
    model_config = model_config()


class SearchMetaDTO(BaseModel):
    """Search timing metadata."""

    search_ms: int
    model_config = model_config()


class SearchResultDTO(BaseModel):
    """Internal search result with metadata and warnings."""

    results: list[SearchItemDTO]
    meta: SearchMetaDTO
    warnings: list[WarningDTO]
    model_config = model_config()


class SearchDataDTO(BaseModel):
    """Search results inside the API data envelope."""

    results: list[SearchItemDTO]
    model_config = model_config()
