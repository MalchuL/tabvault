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
    """Resolve previews/assets and queue capture jobs.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        settings (Settings): Validated process settings shared for this instance lifetime.
        repository (PreviewRepository): Persistence adapter retained for this service instance.
        jobs (JobRepository): Repository used to queue or inspect background jobs.
        mapper (PreviewMapper): Stateless converter between ORM rows and API DTOs.
        job_mapper (JobMapper): Stateless converter for background-job DTOs.
    """

    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        repository: PreviewRepository,
        jobs: JobRepository,
    ) -> None:
        """Initialize preview query dependencies.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session.
            settings (Settings): Validated runtime settings for this operation.
            repository (PreviewRepository): Persistence adapter used by this service.
            jobs (JobRepository): Background-job repository or worker dependency.
        """
        self.db = db
        self.settings = settings
        self.repository = repository
        self.jobs = jobs
        self.mapper = PreviewMapper()
        self.job_mapper = JobMapper()

    async def preview(self, tab_id: str) -> PreviewDTO:
        """Return current preview state for one tab.

        Args:
            tab_id (str): Stable identifier of the saved tab.

        Returns:
            PreviewDTO: Preview status and captured content for the tab.

        Raises:
            TabNotFoundError: The requested saved tab does not exist.
        """
        if await self.repository.get_tab(tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return self.mapper.to_dto(tab_id, await self.repository.get_preview(tab_id))

    async def queue(self, tab_id: str) -> JobQueuedDTO:
        """Queue preview capture unless one is active.

        Args:
            tab_id (str): Stable identifier of the saved tab.

        Returns:
            JobQueuedDTO: Identifier and state of the queued background job.

        Raises:
            TabNotFoundError: The requested saved tab does not exist.
        """
        if await self.repository.get_tab(tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        existing = await self.jobs.find_active("preview_capture", tab_id)
        if existing:
            return JobQueuedDTO(job_id=existing.id)
        job = await self.jobs.add(self.job_mapper.create("preview_capture", target_id=tab_id))
        await self.db.commit()
        return JobQueuedDTO(job_id=job.id)

    async def asset(self, asset_id: str) -> AssetFileDTO:
        """Resolve an asset file or bundled fallback.

        Args:
            asset_id (str): Identifier of the captured asset.

        Returns:
            AssetFileDTO: Validated asset path and media type for download.
        """
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
