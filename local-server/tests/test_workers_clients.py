from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
import pytest

from clients.web_capture.client import CaptureRejectedError, WebCaptureClient
from config.settings import Settings
from db.session import configure_database, dispose_database
from domain.system.jobs import JobWorker
from domain.system.preview import PreviewService
from models import Base, Job, Tab


class FakeVectors:
    async def rebuild(self, documents):
        return len(documents)


@pytest.mark.asyncio
async def test_job_worker_all_common_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        data_dir=tmp_path, database_url=f"sqlite+aiosqlite:///{tmp_path / 'jobs.db'}"
    )
    engine, factory = configure_database(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    worker = JobWorker(settings, FakeVectors())
    assert await worker._next() is False

    async with factory() as db:
        tab = Tab(
            url="https://example.com",
            normalized_url="https://example.com",
            title="Example",
            note=None,
            group_id=None,
            position=0,
            archived=False,
            archived_at=None,
        )
        db.add(tab)
        await db.flush()
        db.add_all(
            [
                Job(kind="preview_capture", target_id=tab.id),
                Job(kind="search_reindex"),
                Job(kind="unknown"),
            ]
        )
        await db.commit()

    async def fake_preview(_service: PreviewService, tab_id: str):
        return {"tabId": tab_id, "status": "ready"}

    monkeypatch.setattr(PreviewService, "capture_tab", fake_preview)
    assert await worker._next() is True
    assert await worker._next() is True
    assert await worker._next() is True
    assert await worker._next() is False

    async with factory() as db:
        jobs = list((await db.scalars(__import__("sqlalchemy").select(Job))).all())
        assert {job.status for job in jobs} == {"done"}

    running = Job(kind="unknown", status="running")
    async with factory() as db:
        db.add(running)
        await db.commit()

    async def idle_run(_worker: JobWorker):
        await asyncio.Event().wait()

    monkeypatch.setattr(JobWorker, "_run", idle_run)
    await worker.start()
    await worker.stop()
    async with factory() as db:
        assert (await db.get(Job, running.id)).status == "pending"
    await dispose_database()


class FakeResponse:
    def __init__(
        self,
        *,
        status: int = 200,
        content_type: str = "text/html",
        chunks: list[bytes] | None = None,
        location: str | None = None,
        url: str = "https://example.com/final",
    ) -> None:
        self.status_code = status
        self.headers = {"content-type": content_type}
        if location:
            self.headers["location"] = location
        self.url = url
        self._chunks = chunks or [b"ok"]

    @property
    def is_redirect(self) -> bool:
        return 300 <= self.status_code < 400

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("bad", request=None, response=None)

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk


class StreamContext:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response

    async def __aenter__(self):
        return self.response

    async def __aexit__(self, *_args):
        return None


class FakeHttpClient:
    responses: list[FakeResponse] = []

    def __init__(self, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, *_args, **_kwargs):
        return StreamContext(self.responses.pop(0))


@pytest.mark.asyncio
async def test_web_capture_redirect_mime_size_and_success(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(
        data_dir=tmp_path, preview_allow_private_hosts=True, preview_max_html_bytes=3
    )
    capture = WebCaptureClient(settings)
    monkeypatch.setattr("clients.web_capture.client.httpx.AsyncClient", FakeHttpClient)

    FakeHttpClient.responses = [
        FakeResponse(status=302, location="/final"),
        FakeResponse(chunks=[b"ok"]),
    ]
    response = await capture.fetch_html("https://example.com/start")
    assert response.content == b"ok"

    FakeHttpClient.responses = [FakeResponse(content_type="application/json")]
    with pytest.raises(CaptureRejectedError, match="content type"):
        await capture.fetch_html("https://example.com")

    FakeHttpClient.responses = [FakeResponse(chunks=[b"toolarge"])]
    with pytest.raises(CaptureRejectedError, match="byte limit"):
        await capture.fetch_html("https://example.com")

    FakeHttpClient.responses = [FakeResponse(status=302, location="/again") for _ in range(6)]
    with pytest.raises(CaptureRejectedError, match="Too many redirects"):
        await capture.fetch_html("https://example.com")

    FakeHttpClient.responses = [FakeResponse(content_type="image/png", chunks=[b"img"])]
    assert (await capture.fetch_image("https://example.com/i.png")).content == b"img"
