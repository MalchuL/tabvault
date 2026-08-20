from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from config.settings import get_settings
from domain.system.jobs import JobWorker


@pytest.fixture
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("TABVAULT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TABVAULT_API_KEY", "test-key")
    get_settings.cache_clear()

    async def no_worker(_worker: JobWorker) -> None:
        return None

    monkeypatch.setattr(JobWorker, "start", no_worker)
    monkeypatch.setattr(JobWorker, "stop", no_worker)
    with TestClient(create_app()) as value:
        yield value
    get_settings.cache_clear()


@pytest.fixture
def headers() -> dict[str, str]:
    return {"X-API-Key": "test-key"}
