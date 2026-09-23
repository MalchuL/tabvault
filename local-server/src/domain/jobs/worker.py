"""Single-process background job worker."""

from __future__ import annotations

import asyncio
import logging
from contextlib import suppress

from pydantic import BaseModel

from clients.web_capture.client import WebCaptureClient
from config.settings import Settings
from db.session import get_session_factory
from domain.indexing.repository import IndexingRepository
from domain.indexing.vector_index import LocalVectorIndex
from domain.previews.repository import PreviewRepository
from domain.previews.service import PreviewService
from domain.transfer.repository import TransferRepository
from domain.transfer.service import TransferService
from lib.time import utc_now

from .repository import JobRepository

logger = logging.getLogger(__name__)


class JobWorker:
    """Run queued local jobs sequentially in the application process.

    The operation participates in the single-process background worker. Durable Job rows remain the
    source of truth, while the in-memory wake signal only reduces polling latency.

    Attributes:
        settings (Settings): Validated process settings shared for this instance lifetime.
        vectors (LocalVectorIndex): Shared local vector index used for semantic search and indexing.
        _task (asyncio.Task[None] | None): Worker task while running, or None before start and after stop.
        _wake (asyncio.Event): In-memory event that wakes the worker between polling cycles.
    """

    def __init__(self, settings: Settings, vectors: LocalVectorIndex) -> None:
        """Initialize worker state and dependencies.

        The operation participates in the single-process background worker. Durable Job rows remain
        the source of truth, while the in-memory wake signal only reduces polling latency.

        Args:
            settings (Settings): Validated process settings that control this component.
            vectors (LocalVectorIndex): Vector index used for semantic search.
        """
        self.settings = settings
        self.vectors = vectors
        self._task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()

    async def start(self) -> None:
        """Reset interrupted jobs and start the worker task.

        The operation participates in the single-process background worker. Durable Job rows remain
        the source of truth, while the in-memory wake signal only reduces polling latency.
        """
        async with get_session_factory()() as db:
            await JobRepository(db).reset_running()
            await db.commit()
        self._task = asyncio.create_task(self._run(), name="tabvault-jobs")

    async def stop(self) -> None:
        """Cancel and await the worker task.

        The operation participates in the single-process background worker. Durable Job rows remain
        the source of truth, while the in-memory wake signal only reduces polling latency.
        """
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    def wake(self) -> None:
        """Wake the worker after a producer queues work.

        The operation participates in the single-process background worker. Durable Job rows remain
        the source of truth, while the in-memory wake signal only reduces polling latency.
        """
        self._wake.set()

    async def _run(self) -> None:
        """Poll for work until the task is cancelled.

        The operation participates in the single-process background worker. Durable Job rows remain
        the source of truth, while the in-memory wake signal only reduces polling latency.
        """
        while True:
            handled = await self._next()
            if handled:
                continue
            with suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=1)
            self._wake.clear()

    async def _next(self) -> bool:
        """Process the next pending job if one exists.

        The operation participates in the single-process background worker. Durable Job rows remain
        the source of truth, while the in-memory wake signal only reduces polling latency.

        Returns:
            bool: True when a pending job was claimed and processed; otherwise False.
        """
        async with get_session_factory()() as db:
            repository = JobRepository(db)
            job = await repository.next_pending()
            if job is None:
                return False
            repository.update(job, status="running", progress=0.05)
            await db.commit()
            try:
                result_value: BaseModel | dict[str, object]
                if job.kind == "preview_capture" and job.target_id:
                    result_value = await PreviewService(
                        db,
                        self.settings,
                        WebCaptureClient(self.settings),
                        PreviewRepository(db),
                    ).capture_tab(job.target_id)
                elif job.kind == "search_reindex":
                    tabs = await IndexingRepository(db).active_tabs(utc_now())
                    result_value = {
                        "indexedCount": await self.vectors.rebuild(
                            [
                                (
                                    tab.id,
                                    "\n".join(
                                        filter(
                                            None,
                                            [tab.title, tab.note, tab.agent_review, tab.url],
                                        )
                                    ),
                                )
                                for tab in tabs
                            ]
                        )
                    }
                elif job.kind == "backup_restore" and job.result and "content" in job.result:
                    result_value = await TransferService(
                        db,
                        self.settings,
                        TransferRepository(db),
                        repository,
                    ).apply(job.result["content"], "json", "replace")
                else:
                    result_value = {"skipped": "unknown_job"}
                result = (
                    result_value.model_dump(mode="json", by_alias=True, exclude_none=True)
                    if isinstance(result_value, BaseModel)
                    else result_value
                )
                repository.update(
                    job,
                    status="done",
                    progress=1,
                    result=result,
                    error=None,
                )
            except Exception as error:
                logger.exception("Background job %s failed", job.id)
                repository.update(job, status="failed", error=str(error))
            await db.commit()
            return True
