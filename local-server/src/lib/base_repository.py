"""Shared Advanced Alchemy repository base."""

from __future__ import annotations

from typing import Generic, TypeVar

from advanced_alchemy.repository import SQLAlchemyAsyncRepository
from sqlalchemy.ext.asyncio import AsyncSession

from models import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(SQLAlchemyAsyncRepository[ModelT], Generic[ModelT]):  # type: ignore[type-var]
    """Configure repositories for explicit service-owned transactions.

    This shared backend helper centralizes the behavior so API, domain, and infrastructure code use
    the same representation and edge-case handling.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize Advanced Alchemy without automatic commits.

        This shared backend helper centralizes the behavior so API, domain, and infrastructure code
        use the same representation and edge-case handling.

        Args:
            session (AsyncSession): Request-scoped asynchronous database session used by this
                operation.
        """
        super().__init__(session=session)
