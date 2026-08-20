from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Literal, cast

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config.settings import Settings
from domain.tabs.error import TabNotFoundError
from domain.tabs.mapper import TabMapper
from lib.time import iso, utc_now
from models import Asset, Backup, Group, HealthSchedule, Job, Preview, Tab, Tag

from .error import (
    BackupNotFoundError,
    JobNotFoundError,
    SemanticUnavailableError,
)
from .search import LocalVectorIndex
from .transfer import TransferService

logger = logging.getLogger(__name__)


class SystemService:
    def __init__(self, db: AsyncSession, settings: Settings, vectors: LocalVectorIndex) -> None:
        self.db = db
        self.settings = settings
        self.vectors = vectors
        self.mapper = TabMapper()

    async def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "version": "0.2.0",
            "schemaVersion": 1,
            "storage": {
                "tabs": int(
                    await self.db.scalar(select(func.count(Tab.id)).where(Tab.archived.is_(False)))
                    or 0
                ),
                "groups": int(
                    await self.db.scalar(
                        select(func.count(Group.id)).where(Group.archived.is_(False))
                    )
                    or 0
                ),
                "tags": int(await self.db.scalar(select(func.count(Tag.name))) or 0),
            },
            "vectorIndex": self.vectors.status(),
        }

    async def search(
        self,
        q: str,
        mode: Literal["semantic", "keyword", "hybrid"],
        limit: int,
        group_id: str | None,
        tags: list[str],
        min_score: float,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        started = time.perf_counter()
        filters: list[Any] = [Tab.archived.is_(False)]
        if group_id:
            filters.append(Tab.group_id == group_id)
        for tag in tags:
            filters.append(Tab.tags.any(func.lower(Tag.name) == tag.lower()))
        rows = list(
            (
                await self.db.scalars(select(Tab).where(*filters).options(selectinload(Tab.tags)))
            ).unique()
        )
        by_id = {row.id: row for row in rows}
        terms = [term.lower() for term in q.split() if term]
        keyword: dict[str, tuple[float, str]] = {}
        for row in rows:
            fields = {
                "title": row.title.lower(),
                "url": row.url.lower(),
                "note": (row.note or "").lower(),
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
        warnings: list[dict[str, Any]] = []
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
                    {"code": "W_SEMANTIC_UNAVAILABLE", "path": "query.mode", "message": str(error)}
                )
            embedding_ms = round((time.perf_counter() - embedding_started) * 1000)
        ids = set(keyword if mode != "semantic" else ()) | set(
            semantic if mode != "keyword" else ()
        )
        results: list[dict[str, Any]] = []
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
            match_type = (
                "both"
                if tab_id in keyword and tab_id in semantic
                else "semantic"
                if tab_id in semantic
                else "keyword"
            )
            results.append(
                {
                    "tab": self.mapper.to_dto(by_id[tab_id]).model_dump(mode="json", by_alias=True),
                    "score": round(score, 4),
                    "matchType": match_type,
                    "matchedOn": keyword.get(tab_id, (0, "semantic"))[1],
                }
            )
        results.sort(key=lambda item: item["score"], reverse=True)
        return {
            "results": results[:limit],
            "meta": {
                "queryEmbeddingMs": embedding_ms,
                "searchMs": round((time.perf_counter() - started) * 1000),
            },
        }, warnings

    async def queue_reindex(self) -> dict[str, str]:
        existing = await self.db.scalar(
            select(Job)
            .where(Job.kind == "search_reindex", Job.status.in_(["pending", "running"]))
            .order_by(Job.created_at.desc())
        )
        if existing:
            return {"jobId": existing.id}
        job = Job(kind="search_reindex")
        self.db.add(job)
        await self.db.commit()
        return {"jobId": job.id}

    async def index_status(self) -> dict[str, Any]:
        schedule = await self._schedule()
        return {**self.vectors.status(), "healthCheck": self._schedule_dict(schedule)}

    async def _schedule(self) -> HealthSchedule:
        schedule = await self.db.get(HealthSchedule, 1)
        if schedule is None:
            schedule = HealthSchedule(id=1)
            self.db.add(schedule)
            await self.db.flush()
        return schedule

    @staticmethod
    def _schedule_dict(schedule: HealthSchedule) -> dict[str, Any]:
        return {
            "enabled": schedule.interval_seconds > 0,
            "intervalSeconds": schedule.interval_seconds,
            "notifyOnNeedsAttention": schedule.notify_on_needs_attention,
            "lastCheck": iso(schedule.last_check),
            "lastResult": schedule.last_result,
            "lastAlert": iso(schedule.last_alert),
        }

    async def configure_health(self, interval: int, notify: bool | None) -> dict[str, Any]:
        schedule = await self._schedule()
        schedule.interval_seconds = interval
        if notify is not None:
            schedule.notify_on_needs_attention = notify
        await self.db.commit()
        return self._schedule_dict(schedule)

    async def run_health(self) -> dict[str, Any]:
        schedule = await self._schedule()
        schedule.last_check = utc_now()
        schedule.last_result = (
            "ready" if self.vectors.status()["status"] == "ready" else "needs_attention"
        )
        schedule.last_alert = (
            schedule.last_check
            if schedule.last_result == "needs_attention" and schedule.notify_on_needs_attention
            else None
        )
        await self.db.commit()
        return self._schedule_dict(schedule)

    async def job(self, job_id: str) -> dict[str, Any]:
        job = await self.db.get(Job, job_id)
        if job is None:
            raise JobNotFoundError(f"Job {job_id!r} was not found")
        return {
            "id": job.id,
            "status": job.status,
            "progress": job.progress,
            "result": job.result,
            "error": job.error,
            "createdAt": iso(job.created_at),
            "updatedAt": iso(job.updated_at),
        }

    async def preview(self, tab_id: str) -> dict[str, Any]:
        if await self.db.get(Tab, tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        preview = await self.db.get(Preview, tab_id)
        if preview is None:
            return {
                "tabId": tab_id,
                "status": "pending",
                "fallbackAsset": "/api/v1/assets/fallback-preview",
            }
        return {
            "tabId": tab_id,
            "status": preview.status,
            "title": preview.title,
            "byline": preview.byline,
            "siteName": preview.site_name,
            "excerpt": preview.excerpt,
            "contentHtml": preview.content_html,
            "length": preview.length,
            "sourceUrl": preview.source_url,
            "error": preview.error,
            "fetchedAt": iso(preview.fetched_at),
            "fallbackAsset": "/api/v1/assets/fallback-preview",
        }

    async def queue_preview(self, tab_id: str) -> dict[str, str]:
        if await self.db.get(Tab, tab_id) is None:
            raise TabNotFoundError(f"Tab {tab_id!r} was not found")
        existing = await self.db.scalar(
            select(Job)
            .where(
                Job.kind == "preview_capture",
                Job.target_id == tab_id,
                Job.status.in_(["pending", "running"]),
            )
            .order_by(Job.created_at.desc())
        )
        if existing:
            return {"jobId": existing.id}
        job = Job(kind="preview_capture", target_id=tab_id)
        self.db.add(job)
        await self.db.commit()
        return {"jobId": job.id}

    async def asset(self, asset_id: str) -> tuple[Path, str]:
        fallback = asset_id in {"fallback-icon", "fallback-preview"}
        if fallback:
            path = (
                Path(__file__).parents[3]
                / "assets"
                / ("fallback-icon.svg" if asset_id == "fallback-icon" else "fallback-preview.svg")
            )
            return path, "image/svg+xml"
        asset = await self.db.get(Asset, asset_id)
        if asset is None:
            logger.warning("Asset %s is missing; returning the bundled fallback", asset_id)
            return Path(__file__).parents[3] / "assets" / "fallback-preview.svg", "image/svg+xml"
        path = self.settings.asset_dir / asset.path
        if not path.exists():
            logger.warning("Asset file %s is unreadable; returning the bundled fallback", path)
            fallback_name = "fallback-icon.svg" if asset.kind == "icon" else "fallback-preview.svg"
            return Path(__file__).parents[3] / "assets" / fallback_name, "image/svg+xml"
        return path, asset.content_type

    async def backups(self) -> list[dict[str, Any]]:
        rows = list(
            (await self.db.scalars(select(Backup).order_by(Backup.created_at.desc()))).all()
        )
        return [
            {
                "id": row.id,
                "createdAt": iso(row.created_at),
                "reason": row.reason,
                "sizeBytes": row.size_bytes,
            }
            for row in rows
        ]

    async def restore_backup(self, backup_id: str) -> dict[str, str]:
        job_id = await TransferService(self.db, self.settings).restore_backup(backup_id)
        if job_id is None:
            raise BackupNotFoundError(f"Backup {backup_id!r} was not found")
        return {"jobId": job_id}

    async def clear_library(self) -> dict[str, Any]:
        backup = await TransferService(self.db, self.settings).create_backup("clear_library")
        await self.db.execute(delete(Tab))
        await self.db.execute(delete(Group))
        await self.db.execute(delete(Tag))
        await self.db.commit()
        return {"cleared": True, "backupSnapshotId": backup.id}

    @staticmethod
    def schema() -> dict[str, Any]:
        path = Path(__file__).parents[3] / "schema" / "v1.tabvault.schema.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))

    @staticmethod
    def errors() -> dict[str, Any]:
        path = Path(__file__).parents[3] / "errors" / "catalog.json"
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
