"""Persistence for captured previews and assets."""

from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Asset, Preview, Tab


class PreviewRepository:
    """Read and stage preview-related rows without committing."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a request-scoped session."""
        self.session = session

    async def get_tab(self, tab_id: str) -> Tab | None:
        """Load one preview source tab."""
        return await self.session.get(Tab, tab_id)

    async def get_preview(self, tab_id: str) -> Preview | None:
        """Load preview state for a tab."""
        return await self.session.get(Preview, tab_id)

    async def save_preview(self, preview: Preview) -> Preview:
        """Stage a preview row."""
        self.session.add(preview)
        await self.session.flush()
        return preview

    async def get_asset(self, asset_id: str) -> Asset | None:
        """Load an asset by ID."""
        return await self.session.get(Asset, asset_id)

    async def find_asset_checksum(self, checksum: str) -> Asset | None:
        """Find an asset by checksum."""
        return cast(
            Asset | None,
            await self.session.scalar(select(Asset).where(Asset.checksum == checksum)),
        )

    async def save_asset(self, asset: Asset) -> Asset:
        """Stage a captured asset."""
        self.session.add(asset)
        await self.session.flush()
        return asset

    @staticmethod
    async def apply_changes(model: object, changes: dict[str, object]) -> None:
        """Stage mapped fields on a preview-owned model."""
        for key, value in changes.items():
            setattr(model, key, value)
