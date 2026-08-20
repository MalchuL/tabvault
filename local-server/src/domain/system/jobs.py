from __future__ import annotations

import asyncio
import logging
from contextlib import suppress

from sqlalchemy import select

from clients.web_capture.client import WebCaptureClient
from config.settings import Settings
from db.session import get_session_factory
from models import Job, Tab

from .preview import PreviewService
from .search import LocalVectorIndex
from .transfer import TransferService

logger = logging.getLogger(__name__)


class JobWorker:
    def __init__(self, settings: Settings, vectors: LocalVectorIndex) -> None:
        self.settings = settings
        self.vectors = vectors
        self._task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()

    async def start(self) -> None:
        async with get_session_factory()() as db:
            for job in (await db.scalars(select(Job).where(Job.status == "running"))).all():
                job.status = "pending"
            await db.commit()
        self._task = asyncio.create_task(self._run(), name="tabvault-jobs")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    def wake(self) -> None:
        self._wake.set()

    async def _run(self) -> None:
        while True:
            handled = await self._next()
            if handled:
                continue
            with suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=1)
            self._wake.clear()

    async def _next(self) -> bool:
        async with get_session_factory()() as db:
            job = await db.scalar(
                select(Job).where(Job.status == "pending").order_by(Job.created_at)
            )
            if job is None:
                return False
            job.status = "running"
            job.progress = 0.05
            await db.commit()
            try:
                if job.kind == "preview_capture" and job.target_id:
                    result = await PreviewService(
                        db, self.settings, WebCaptureClient(self.settings)
                    ).capture_tab(job.target_id)
                elif job.kind == "search_reindex":
                    tabs = list(
                        (await db.scalars(select(Tab).where(Tab.archived.is_(False)))).all()
                    )
                    result = {
                        "indexedCount": await self.vectors.rebuild(
                            [
                                (tab.id, "\n".join(filter(None, [tab.title, tab.note, tab.url])))
                                for tab in tabs
                            ]
                        )
                    }
                elif job.kind == "backup_restore" and job.result and "content" in job.result:
                    result = await TransferService(db, self.settings).apply(
                        job.result["content"], "json", "replace"
                    )
                else:
                    result = {"skipped": "unknown_job"}
                job.status = "done"
                job.progress = 1
                job.result = result
                job.error = None
            except Exception as error:
                logger.exception("Background job %s failed", job.id)
                job.status = "failed"
                job.error = str(error)
            await db.commit()
            return True
