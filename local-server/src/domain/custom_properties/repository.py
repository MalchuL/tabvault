"""Persistence operations for the singleton Custom Property Schema."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.time import utc_now
from models import PropertyDefinition, Tab


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

    async def definitions(self) -> dict[str, dict[str, Any]]:
        """Return definitions keyed by their stable case-sensitive names."""
        rows = (await self.session.scalars(select(PropertyDefinition))).all()
        return {row.name: row.definition for row in rows}

    async def list_tabs(self) -> list[Tab]:
        """Load every Saved Tab for validation or repair.

        Returns:
            list[Tab]: All persisted Saved Tabs in stable identity order.
        """
        return list((await self.session.scalars(select(Tab).order_by(Tab.id))).all())

    async def get_definition(self, name: str) -> PropertyDefinition | None:
        """Load a definition by name.

        Args:
            name (str): Case-sensitive property identity.

        Returns:
            PropertyDefinition | None: Existing row, when declared.
        """
        return await self.session.get(PropertyDefinition, name)

    async def upsert_definition(self, name: str, definition: dict[str, Any]) -> None:
        """Stage a definition and its modification timestamp.

        Args:
            name (str): Case-sensitive property identity.
            definition (dict[str, Any]): Validated schema fields.
        """
        row = await self.get_definition(name)
        if row is None:
            self.session.add(PropertyDefinition(name=name, definition=definition))
        else:
            row.definition = definition
            row.updated_at = utc_now()

    async def delete_definition(self, row: PropertyDefinition) -> None:
        """Stage deletion without touching raw overrides.

        Args:
            row (PropertyDefinition): Existing definition to remove.
        """
        await self.session.delete(row)
