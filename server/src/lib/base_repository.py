"""Shared Advanced Alchemy repository base."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from advanced_alchemy.filters import LimitOffset
from advanced_alchemy.repository import SQLAlchemyAsyncRepository
from sqlalchemy.ext.asyncio import AsyncSession

from lib.pagination import ListOptions, Page
from models import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(SQLAlchemyAsyncRepository[ModelT], Generic[ModelT]):  # type: ignore[type-var]
    """Configure repositories for explicit service-owned transactions."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize Advanced Alchemy without automatic commits.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        super().__init__(session=session)

    async def list_page(
        self,
        *filters: Any,
        list_options: ListOptions,
        order_by: Any = None,
        load: Any = None,
    ) -> Page[ModelT]:
        """List and count rows using repository-local Advanced Alchemy filters.

        Args:
            *filters (Any): SQL filters applied before counting and paginating rows.
            list_options (ListOptions): Page size and row offset for the query.
            order_by (Any): SQL expressions controlling result ordering.
            load (Any): Optional ORM loader strategy for related rows.

        Returns:
            Page[ModelT]: Matching records and pagination metadata.
        """
        rows, total = await self.get_many_and_count(
            *filters,
            LimitOffset(offset=list_options.offset, limit=list_options.limit),
            order_by=order_by,
            load=load,
        )
        return Page(
            data=rows,
            has_next=list_options.offset + len(rows) < total,
            total=total,
        )
