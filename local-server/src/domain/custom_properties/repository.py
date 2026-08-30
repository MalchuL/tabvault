"""Persistence operations for the singleton Custom Property Schema."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PropertySchema, Tab


class CustomPropertyRepository:
    """Load and stage schema and tab property persistence without committing.

    Attributes:
        session (AsyncSession): Request-scoped transaction owned by the calling service.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository with a request-scoped session.

        Args:
            session (AsyncSession): Session used for reads, flushes, and staged mutations.
        """
        self.session = session

    async def get_schema(self) -> PropertySchema | None:
        """Load the singleton schema row without creating it.

        Returns:
            PropertySchema | None: Persisted schema or ``None`` before the first mutation.
        """
        return await self.session.get(PropertySchema, 1)

    async def get_or_create_schema(self) -> PropertySchema:
        """Load or stage the singleton schema row.

        Returns:
            PropertySchema: Existing or newly staged singleton row.
        """
        schema = await self.get_schema()
        if schema is None:
            schema = PropertySchema(id=1, properties={})
            self.session.add(schema)
            await self.session.flush()
        return schema

    async def list_tabs(self) -> list[Tab]:
        """Load every Saved Tab for validation or repair.

        Returns:
            list[Tab]: All persisted Saved Tabs in stable identity order.
        """
        return list((await self.session.scalars(select(Tab).order_by(Tab.id))).all())
