"""System application service and transaction boundaries."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from domain.tabs.error import TabNotFoundError
from domain.tabs.mapper import TabMapper
from lib.responses import WarningDTO
from lib.time import utc_now
from models import HealthSchedule

from .dto import (
    AssetFileDTO,
    BackupDTO,
    HealthDTO,
    HealthScheduleDTO,
    IndexStatusDTO,
    JobDTO,
    JobQueuedDTO,
    LibraryClearDTO,
    PreviewDTO,
    SearchItemDTO,
    SearchMatchedOn,
    SearchMatchType,
    SearchMetaDTO,
    SearchMode,
    SearchResultDTO,
    StorageCountsDTO,
)
from .error import (
    BackupNotFoundError,
    JobNotFoundError,
    SemanticUnavailableError,
)
from .mapper import SystemMapper
from .repository import SystemRepository
from .search import LocalVectorIndex
from .transfer import TransferService

logger = logging.getLogger(__name__)


class SystemService:
    """Orchestrate system use cases while owning transactions."""

    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        vectors: LocalVectorIndex,
        repository: SystemRepository,
        transfer: TransferService,
    ) -> None:
        """Initialize the service and its dependencies."""
        self.db = db
        self.settings = settings
        self.vectors = vectors
        self.repository = repository
        self.transfer = transfer
        self.mapper = TabMapper()
        self.system_mapper = SystemMapper()

    async def health(self) -> HealthDTO:
        """Return server and storage health."""
        tabs, groups, tags = await self.repository.health_counts()
        return HealthDTO(
            status="ok",
            version="0.2.0",
            schema_version=1,
            storage=StorageCountsDTO(tabs=tabs, groups=groups, tags=tags),
            vector_index=self.vectors.status(),
        )

    async def search(
        self,
        q: str,
        mode: SearchMode,
        limit: int,
        group_id: str | None,
        tags: list[str],
        min_score: float,
    ) -> SearchResultDTO:
        """Search active tabs using keyword and optional semantic scores."""
        started = time.perf_counter()
        rows = await self.repository.search_tabs(group_id, tags)
        by_id = {row.id: row for row in rows}
        terms = [term.lower() for term in q.split() if term]
        keyword: dict[str, tuple[float, SearchMatchedOn]] = {}
        for row in rows:
            fields: dict[SearchMatchedOn, str] = {
                "title": row.title.lower(),
                "url": row.url.lower(),
                "note": (row.note or "").lower(),
                "agentReview": row.agent_review.lower(),
            }
            matches = [(name, sum(term in text for term in terms)) for name, text in fields.items()]
            name, count = max(matches, key=lambda item: item[1])
            tag_count = sum(
                term in " ".join(tag.name for tag in row.tags).lower() for term in terms
            )
            if tag_count > count:
                name, count = "tags", tag_count
            if count:
                keyword[row.id] = (count / max(len(terms), 1), name)
        semantic: dict[str, float] = {}
        warnings: list[WarningDTO] = []
        embedding_ms = 0
        if mode in {"semantic", "hybrid"}:
            embedding_started = time.perf_counter()
            try:
                semantic = {
                    tab_id: score
                    for tab_id, score in await self.vectors.search(q, max(limit * 4, 50))
                    if tab_id in by_id and score >= min_score
                }
            except Exception as error:
                if mode == "semantic":
                    raise SemanticUnavailableError(str(error)) from error
                warnings.append(
                    WarningDTO(
                        code="W_SEMANTIC_UNAVAILABLE",
                        path="query.mode",
                        message=str(error),
                    )
                )
            embedding_ms = round((time.perf_counter() - embedding_started) * 1000)
        ids = set(keyword if mode != "semantic" else ()) | set(
            semantic if mode != "keyword" else ()
        )
        results: list[SearchItemDTO] = []
        for tab_id in ids:
            keyword_score = keyword.get(tab_id, (0.0, ""))[0]
            semantic_score = semantic.get(tab_id, 0.0)
            score = (
                keyword_score
                if mode == "keyword" or not semantic
                else semantic_score
                if mode == "semantic"
                else 0.65 * semantic_score + 0.35 * keyword_score
            )
            match_type: SearchMatchType = (
                "both"
                if tab_id in keyword and tab_id in semantic
                else "semantic"
                if tab_id in semantic
                else "keyword"
            )
            results.append(
                SearchItemDTO(
                    tab=self.mapper.to_dto(by_id[tab_id]),
                    score=round(score, 4),
                    match_type=match_type,
                    matched_on=keyword.get(tab_id, (0, "semantic"))[1],
                )
            )
        results.sort(key=lambda item: item.score, reverse=True)
        return SearchResultDTO(
            results=results[:limit],
            meta=SearchMetaDTO(
                query_embedding_ms=embedding_ms,
                search_ms=round((time.perf_counter() - started) * 1000),
            ),
            warnings=warnings,
        )

    async def queue_reindex(self) -> JobQueuedDTO:
        """Queue a vector-index rebuild unless one is already active."""
        existing = await self.repository.find_active_job("search_reindex")
        if existing:
            return JobQueuedDTO(job_id=existing.id)
        job = await self.repository.add_job(self.system_mapper.job("search_reindex"))
        await self.db.commit()
        return JobQueuedDTO(job_id=job.id)

    async def index_status(self) -> IndexStatusDTO:
        """Return vector-index and scheduled health state."""
        schedule = await self._schedule()
        vector = self.vectors.status()
        return IndexStatusDTO(**vector.model_dump(), health_check=self._schedule_dict(schedule))

    async def _schedule(self) -> HealthSchedule:
        """Load or initialize health scheduling state."""
        return await self.repository.get_schedule()

    def _schedule_dict(self, schedule: HealthSchedule) -> HealthScheduleDTO:
        """Map health scheduling state to a response DTO."""
        return self.system_mapper.schedule_to_dto(schedule)

    async def configure_health(self, interval: int, notify: bool | None) -> HealthScheduleDTO:
        """Configure recurring vector-index health checks."""
        schedule = await self._schedule()
        changes: dict[str, object] = {"interval_seconds": interval}
        if notify is not None:
            changes["notify_on_needs_attention"] = notify
        await self.repository.apply_schedule(schedule, **changes)
        await self.db.commit()
        return self._schedule_dict(schedule)

    async def run_health(self) -> HealthScheduleDTO:
        """Run and persist a vector-index health check."""
        schedule = await self._schedule()
        last_check = utc_now()
        last_result = "ready" if self.vectors.status().status == "ready" else "needs_attention"
        last_alert = (
            last_check
            if last_result == "needs_attention" and schedule.notify_on_needs_attention
            else None
        )
        await self.repository.apply_schedule(
            schedule,
            last_check=last_check,
            last_result=last_result,
            last_alert=last_alert,
        )
        await self.db.commit()
        return self._schedule_dict(schedule)

    async def job(self, job_id: str) -> JobDTO:
        """Return one background job."""
        job = await self.repository.get_job(job_id)
        if job is None:
            raise JobNotFoundError(f"Job {job_id!r} was not found")
        return self.system_mapper.job_to_dto(job)

    async def preview(self, tab_id: str) -> PreviewDTO:
        """Return current preview state for a tab."""
        if await self.repository.get_tab(tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        return self.system_mapper.preview_to_dto(tab_id, await self.repository.get_preview(tab_id))

    async def queue_preview(self, tab_id: str) -> JobQueuedDTO:
        """Queue preview capture unless one is already active."""
        if await self.repository.get_tab(tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        existing = await self.repository.find_active_job("preview_capture", tab_id)
        if existing:
            return JobQueuedDTO(job_id=existing.id)
        job = await self.repository.add_job(
            self.system_mapper.job("preview_capture", target_id=tab_id)
        )
        await self.db.commit()
        return JobQueuedDTO(job_id=job.id)

    async def asset(self, asset_id: str) -> AssetFileDTO:
        """Resolve an asset file or bundled fallback."""
        fallback = asset_id in {"fallback-icon", "fallback-preview"}
        if fallback:
            path = (
                Path(__file__).parents[3]
                / "assets"
                / ("fallback-icon.svg" if asset_id == "fallback-icon" else "fallback-preview.svg")
            )
            return self.system_mapper.asset_file(path, "image/svg+xml")
        asset = await self.repository.get_asset(asset_id)
        if asset is None:
            logger.warning("Asset %s is missing; returning the bundled fallback", asset_id)
            return self.system_mapper.asset_file(
                Path(__file__).parents[3] / "assets" / "fallback-preview.svg",
                "image/svg+xml",
            )
        path = self.settings.asset_dir / asset.path
        if not path.exists():
            logger.warning("Asset file %s is unreadable; returning the bundled fallback", path)
            fallback_name = "fallback-icon.svg" if asset.kind == "icon" else "fallback-preview.svg"
            return self.system_mapper.asset_file(
                Path(__file__).parents[3] / "assets" / fallback_name,
                "image/svg+xml",
            )
        return self.system_mapper.asset_file(path, asset.content_type)

    async def backups(self) -> list[BackupDTO]:
        """List available backup snapshots."""
        return [self.system_mapper.backup_to_dto(row) for row in await self.repository.backups()]

    async def restore_backup(self, backup_id: str) -> JobQueuedDTO:
        """Queue restoration of an existing backup."""
        job_id = await self.transfer.restore_backup(backup_id)
        if job_id is None:
            raise BackupNotFoundError(f"Backup {backup_id!r} was not found")
        return JobQueuedDTO(job_id=job_id)

    async def clear_library(self) -> LibraryClearDTO:
        """Back up and clear the complete local library."""
        backup = await self.transfer.create_backup("clear_library")
        await self.repository.clear_library()
        await self.db.commit()
        return LibraryClearDTO(cleared=True, backup_snapshot_id=backup.id)

    @staticmethod
    def schema() -> dict[str, Any]:
        """Load the canonical portable-document JSON schema."""
        path = Path(__file__).parents[3] / "schema" / "v1.tabvault.schema.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))

    @staticmethod
    def errors() -> dict[str, Any]:
        """Load the stable API error catalog."""
        path = Path(__file__).parents[3] / "errors" / "catalog.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
