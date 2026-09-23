"""Preview query and capture-queue operations."""

import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from domain.jobs.dto import JobQueuedDTO
from domain.jobs.mapper import JobMapper
from domain.jobs.repository import JobRepository
from domain.tabs.error import TabNotFoundError

from .dto import AssetFileDTO, PreviewDTO
from .mapper import PreviewMapper
from .repository import PreviewRepository

logger = logging.getLogger(__name__)


class PreviewQueryService:
    """Resolve previews/assets and queue capture jobs."""

    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        repository: PreviewRepository,
        jobs: JobRepository,
    ) -> None:
        """Initialize preview query dependencies."""
        self.db = db
        self.settings = settings
        self.repository = repository
        self.jobs = jobs
        self.mapper = PreviewMapper()
        self.job_mapper = JobMapper()

    async def preview(self, tab_id: str) -> PreviewDTO:
        """Return current preview state for one tab."""
        if await self.repository.get_tab(tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return self.mapper.to_dto(tab_id, await self.repository.get_preview(tab_id))

    async def queue(self, tab_id: str) -> JobQueuedDTO:
        """Queue preview capture unless one is active."""
        if await self.repository.get_tab(tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        existing = await self.jobs.find_active("preview_capture", tab_id)
        if existing:
            return JobQueuedDTO(job_id=existing.id)
        job = await self.jobs.add(self.job_mapper.create("preview_capture", target_id=tab_id))
        await self.db.commit()
        return JobQueuedDTO(job_id=job.id)

    async def asset(self, asset_id: str) -> AssetFileDTO:
        """Resolve an asset file or bundled fallback."""
        assets = Path(__file__).parents[3] / "assets"
        if asset_id in {"fallback-icon", "fallback-preview"}:
            name = "fallback-icon.svg" if asset_id == "fallback-icon" else "fallback-preview.svg"
            return self.mapper.file(assets / name, "image/svg+xml")
        asset = await self.repository.get_asset(asset_id)
        if asset is None:
            logger.warning("Asset %s is missing; returning the bundled fallback", asset_id)
            return self.mapper.file(assets / "fallback-preview.svg", "image/svg+xml")
        path = self.settings.asset_dir / asset.path
        if not path.exists():
            logger.warning("Asset file %s is unreadable; returning the bundled fallback", path)
            name = "fallback-icon.svg" if asset.kind == "icon" else "fallback-preview.svg"
            return self.mapper.file(assets / name, "image/svg+xml")
        return self.mapper.file(path, asset.content_type)
