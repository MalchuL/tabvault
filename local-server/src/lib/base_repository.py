"""Shared Advanced Alchemy repository base."""

from __future__ import annotations

from typing import Generic, TypeVar

from advanced_alchemy.repository import SQLAlchemyAsyncRepository
from sqlalchemy.ext.asyncio import AsyncSession

from models import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(SQLAlchemyAsyncRepository[ModelT], Generic[ModelT]):  # type: ignore[type-var]
    """Configure repositories for explicit service-owned transactions."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize Advanced Alchemy without automatic commits."""
        super().__init__(session=session)
