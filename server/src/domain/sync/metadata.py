"""Shared deletion metadata for resource endpoints and synchronization."""

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Tombstone, TombstoneType


async def record_deletion(
    db: AsyncSession, kind: TombstoneType, identity: str, at: datetime
) -> None:
    """Stage an idempotent tombstone in the caller's transaction.

    Args:
        db (AsyncSession): Transaction-owning session.
        kind (TombstoneType): Deleted resource kind.
        identity (str): Stable resource identity.
        at (datetime): UTC deletion time.
    """
    row = await db.scalar(
        select(Tombstone).where(Tombstone.entity_type == kind, Tombstone.entity_id == identity)
    )
    if row is None:
        db.add(Tombstone(entity_type=kind, entity_id=identity, deleted_at=at))
    elif at > row.deleted_at:
        row.deleted_at = at
    await db.flush()


async def clear_deletion(db: AsyncSession, kind: TombstoneType, identity: str) -> None:
    """Allow an explicit recreation of a named resource.

    Args:
        db (AsyncSession): Caller-owned transaction.
        kind (TombstoneType): Named resource kind.
        identity (str): Name being deliberately recreated.
    """
    await db.execute(
        delete(Tombstone).where(Tombstone.entity_type == kind, Tombstone.entity_id == identity)
    )
