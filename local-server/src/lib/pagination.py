"""Shared offset-pagination types for database-backed list endpoints."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Generic, Self, TypeVar

from pydantic import BaseModel, Field

from lib.dto_config import model_config

MAX_LIST_PAGE_SIZE = 100

ItemT = TypeVar("ItemT")
MappedT = TypeVar("MappedT")


class ListOptions(BaseModel):
    """Carry validated pagination input from a controller to a repository."""

    limit: int = Field(default=MAX_LIST_PAGE_SIZE, ge=1, le=MAX_LIST_PAGE_SIZE)
    offset: int = Field(default=0, ge=0)


@dataclass(frozen=True, slots=True)
class Page(Generic[ItemT]):
    """Contain one repository page and the total matching row count."""

    data: list[ItemT]
    has_next: bool
    total: int

    @property
    def size(self) -> int:
        """Return the number of rows in this page.

        Returns:
            int: Number of items in this page.
        """
        return len(self.data)

    def map(self, mapper: Callable[[ItemT], MappedT]) -> Page[MappedT]:
        """Map page rows without changing pagination metadata.

        Args:
            mapper (Callable[[ItemT], MappedT]): Function used to convert each page item.

        Returns:
            Page[MappedT]: Converted records with the same pagination metadata.
        """
        return Page(
            data=[mapper(item) for item in self.data], has_next=self.has_next, total=self.total
        )


class PaginatedResponse(BaseModel, Generic[ItemT]):
    """Expose a page as ``data``, ``hasNext``, ``size``, and ``total``."""

    data: list[ItemT]
    has_next: bool = False
    size: int = 0
    total: int = 0
    model_config = model_config()

    @classmethod
    def from_page(cls, page: Page[ItemT]) -> Self:
        """Build an HTTP response from a repository page.

        Args:
            page (Page[ItemT]): Source page and its pagination metadata.

        Returns:
            Self: New response object preserving the page metadata.
        """
        return cls(data=page.data, has_next=page.has_next, size=page.size, total=page.total)
