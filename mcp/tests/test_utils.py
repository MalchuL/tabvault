from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from factories import group, tab

from mcp_tabvault.client import MCPClientError
from mcp_tabvault.client.dto import (
    GroupListResponseDTO,
    PaginatedResponseDTO,
    TabDTO,
    TabListResponseDTO,
    TabResponseDTO,
    TabUpdateDTO,
)
from mcp_tabvault.domain.groups import utils as groups
from mcp_tabvault.domain.tabs import utils as tabs


class QueueClient:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    async def _next(self, name: str, *args: Any) -> Any:
        self.calls.append((name, args))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    async def list_groups(self, query: Any) -> GroupListResponseDTO:
        return await self._next("list_groups", query)

    async def get_tab(self, tab_id: str) -> TabResponseDTO:
        return await self._next("get_tab", tab_id)

    async def update_tab(self, tab_id: str, body: TabUpdateDTO) -> TabResponseDTO:
        return await self._next("update_tab", tab_id, body)

    async def list_tabs(self, query: Any) -> TabListResponseDTO:
        return await self._next("list_tabs", query)


def page(*items: TabDTO, has_next: bool = False) -> TabListResponseDTO:
    return PaginatedResponseDTO[TabDTO | Any](data=list(items), has_next=has_next)


@pytest.mark.anyio
async def test_visible_group_policy_pagination(monkeypatch: pytest.MonkeyPatch) -> None:
    future = datetime.now(UTC) + timedelta(days=1)
    past = (datetime.now(UTC) - timedelta(days=1)).replace(tzinfo=None)
    assert tabs._is_hidden(tab(hidden_until=future))
    assert not tabs._is_hidden(tab(hidden_until=past))
    assert not tabs._is_hidden(tab())

    client = QueueClient(
        [
            TabResponseDTO(data=tab(archived=True)),
            TabResponseDTO(data=tab(hidden_until=future)),
            TabResponseDTO(data=tab()),
        ]
    )
    monkeypatch.setattr(tabs, "get_client", lambda: client)
    with pytest.raises(MCPClientError, match="not accessible"):
        await tabs.require_visible_tab("archived")
    with pytest.raises(MCPClientError, match="not accessible"):
        await tabs.require_visible_tab("hidden")
    assert (await tabs.require_visible_tab("visible")).data.id == "tab"

    group_client = QueueClient(
        [
            GroupListResponseDTO(data=[group("other")], has_next=True),
            GroupListResponseDTO(data=[group("wanted")]),
        ]
    )
    monkeypatch.setattr(groups, "get_client", lambda: group_client)
    await groups.require_visible_group("wanted")
    assert group_client.calls[1][1][0].offset == 1


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response",
    [
        GroupListResponseDTO(data=[]),
        GroupListResponseDTO(data=[], has_next=True),
    ],
)
async def test_group_policy_rejects_missing_and_invalid_pages(
    monkeypatch: pytest.MonkeyPatch, response: GroupListResponseDTO
) -> None:
    monkeypatch.setattr(groups, "get_client", lambda: QueueClient([response]))
    with pytest.raises(MCPClientError):
        await groups.require_visible_group("missing")


@pytest.mark.anyio
async def test_url_lookup_paginates_and_filters_exact_visible_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    future = datetime.now(UTC) + timedelta(days=1)
    client = QueueClient(
        [
            page(tab("first"), tab("partial", "https://exact/path"), has_next=True),
            page(
                tab("second"),
                tab("archived", archived=True),
                tab("hidden", hidden_until=future),
            ),
        ]
    )
    monkeypatch.setattr(tabs, "get_client", lambda: client)
    result = await tabs._matching_tabs("https://exact")
    assert [item.id for item in result] == ["first", "second"]
    assert client.calls[1][1][0].offset == 2

    missing = QueueClient([page()])
    monkeypatch.setattr(tabs, "get_client", lambda: missing)
    assert await tabs._matching_tabs("https://missing") == []

    invalid = QueueClient([page(has_next=True)])
    monkeypatch.setattr(tabs, "get_client", lambda: invalid)
    with pytest.raises(RuntimeError, match="invalid empty"):
        await tabs._matching_tabs("https://exact")


@pytest.mark.anyio
async def test_url_bulk_update_is_best_effort(monkeypatch: pytest.MonkeyPatch) -> None:
    updated = TabResponseDTO(data=tab("one", "https://new"))
    client = QueueClient(
        [
            page(tab("one"), tab("two")),
            updated,
            MCPClientError("rejected"),
        ]
    )
    monkeypatch.setattr(tabs, "get_client", lambda: client)

    matching_tabs = await tabs._matching_tabs("https://exact")
    bulk_result = await tabs._best_effort(
        matching_tabs, lambda tab: client.update_tab(tab.id, TabUpdateDTO(url="https://new"))
    )

    assert bulk_result.matched == 2
    assert [item.id for item in bulk_result.data] == ["one"]
    assert bulk_result.errors[0].model_dump(by_alias=True) == {
        "tabId": "two",
        "message": "rejected",
    }
    updates = [call for call in client.calls if call[0] == "update_tab"]
    assert len(updates) == 2
