from __future__ import annotations

import pytest

from mcp_bridge.client import get_client


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_singleton_client() -> None:
    get_client.cache_clear()
    yield
    get_client.cache_clear()
