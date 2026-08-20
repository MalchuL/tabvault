from __future__ import annotations

from typing import Generic, TypeVar

from advanced_alchemy.repository import SQLAlchemyAsyncRepository
from sqlalchemy.ext.asyncio import AsyncSession

from models import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(SQLAlchemyAsyncRepository[ModelT], Generic[ModelT]):  # type: ignore[type-var]
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session)
