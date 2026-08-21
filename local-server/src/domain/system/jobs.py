"""Single-process background job worker."""

from __future__ import annotations

import asyncio
import logging
from contextlib import suppress

from pydantic import BaseModel

from clients.web_capture.client import WebCaptureClient
from config.settings import Settings
from db.session import get_session_factory

from .preview import PreviewService
from .repository import SystemRepository
from .search import LocalVectorIndex
from .transfer import TransferService

logger = logging.getLogger(__name__)


class JobWorker:
    """Run queued local jobs sequentially in the application process."""

    def __init__(self, settings: Settings, vectors: LocalVectorIndex) -> None:
        """Initialize worker state and dependencies."""
        self.settings = settings
        self.vectors = vectors
        self._task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()

    async def start(self) -> None:
        """Reset interrupted jobs and start the worker task."""
        async with get_session_factory()() as db:
            await SystemRepository(db).reset_running_jobs()
            await db.commit()
        self._task = asyncio.create_task(self._run(), name="tabvault-jobs")

    async def stop(self) -> None:
        """Cancel and await the worker task."""
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    def wake(self) -> None:
        """Wake the worker after a producer queues work."""
        self._wake.set()

    async def _run(self) -> None:
        """Poll for work until the task is cancelled."""
        while True:
            handled = await self._next()
            if handled:
                continue
            with suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=1)
            self._wake.clear()

    async def _next(self) -> bool:
        """Process the next pending job if one exists."""
        async with get_session_factory()() as db:
            repository = SystemRepository(db)
            job = await repository.next_pending_job()
            if job is None:
                return False
            await repository.update_job(job, status="running", progress=0.05)
            await db.commit()
            try:
                result_value: BaseModel | dict[str, object]
                if job.kind == "preview_capture" and job.target_id:
                    result_value = await PreviewService(
                        db,
                        self.settings,
                        WebCaptureClient(self.settings),
                        repository,
                    ).capture_tab(job.target_id)
                elif job.kind == "search_reindex":
                    tabs = await repository.active_tabs()
                    result_value = {
                        "indexedCount": await self.vectors.rebuild(
                            [
                                (tab.id, "\n".join(filter(None, [tab.title, tab.note, tab.url])))
                                for tab in tabs
                            ]
                        )
                    }
                elif job.kind == "backup_restore" and job.result and "content" in job.result:
                    result_value = await TransferService(db, self.settings, repository).apply(
                        job.result["content"], "json", "replace"
                    )
                else:
                    result_value = {"skipped": "unknown_job"}
                result = (
                    result_value.model_dump(mode="json", by_alias=True, exclude_none=True)
                    if isinstance(result_value, BaseModel)
                    else result_value
                )
                await repository.update_job(
                    job,
                    status="done",
                    progress=1,
                    result=result,
                    error=None,
                )
            except Exception as error:
                logger.exception("Background job %s failed", job.id)
                await repository.update_job(job, status="failed", error=str(error))
            await db.commit()
            return True
