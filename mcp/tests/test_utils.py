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
    TabProjectionDTO,
)
from mcp_tabvault.domain.groups import utils as groups
from mcp_tabvault.domain.tabs import mapper
from mcp_tabvault.domain.tabs import utils as tabs


class QueueClient:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, Any]] = []

    async def list_groups(self, query: Any) -> GroupListResponseDTO:
        self.calls.append(("list_groups", query))
        return self.responses.pop(0)

    async def list_tabs(self, query: Any) -> TabListResponseDTO:
        self.calls.append(("list_tabs", query))
        return self.responses.pop(0)


def page(*items: TabDTO, has_next: bool = False, size: int | None = None) -> TabListResponseDTO:
    return PaginatedResponseDTO[TabDTO | TabProjectionDTO](
        data=list(items), has_next=has_next, size=len(items) if size is None else size
    )


@pytest.mark.anyio
async def test_group_name_resolution_uses_oldest_case_insensitive_match_across_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    newest = group("new").model_copy(update={"name": "Research"})
    oldest = group("old").model_copy(update={"name": "research"})
    client = QueueClient(
        [
            GroupListResponseDTO(data=[newest], has_next=True, size=7),
            GroupListResponseDTO(data=[oldest]),
        ]
    )
    monkeypatch.setattr(groups, "get_client", lambda: client)

    visible = await groups.visible_groups()
    assert groups.group_named(visible, "RESEARCH").id == "old"
    assert client.calls[1][1].offset == 7
    assert groups.resolve_scope(visible, "research", False) == "old"
    assert groups.resolve_scope(visible, None, False) == "all"
    assert groups.resolve_scope(visible, None, True) is None
    with pytest.raises(ValueError, match="cannot be used together"):
        groups.resolve_scope(visible, "Research", True)
    with pytest.raises(MCPClientError, match="Missing"):
        groups.group_named(visible, "Missing")


@pytest.mark.anyio
async def test_group_pagination_rejects_an_empty_continuation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        groups,
        "get_client",
        lambda: QueueClient([GroupListResponseDTO(data=[], has_next=True, size=0)]),
    )
    with pytest.raises(MCPClientError, match="invalid Group page size"):
        await groups.visible_groups()


@pytest.mark.anyio
async def test_first_tab_uses_oldest_exact_visible_url_and_validates_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    future = datetime.now(UTC) + timedelta(days=1)
    client = QueueClient(
        [
            page(tab("partial", "https://exact/path"), has_next=True, size=9),
            page(tab("oldest"), tab("hidden", hidden_until=future)),
        ]
    )
    monkeypatch.setattr(tabs, "get_client", lambda: client)
    result = await tabs.first_visible_tab("https://exact")
    assert result.id == "oldest"
    assert client.calls[0][1].sort_by == "createdAt"
    assert client.calls[0][1].sort_dir == "asc"
    assert client.calls[1][1].offset == 9

    monkeypatch.setattr(tabs, "get_client", lambda: QueueClient([page()]))
    with pytest.raises(MCPClientError, match="https://missing"):
        await tabs.first_visible_tab("https://missing")

    invalid = QueueClient([page(tab(), has_next=True, size=0)])
    monkeypatch.setattr(tabs, "get_client", lambda: invalid)
    with pytest.raises(MCPClientError, match="invalid Saved Tab page size"):
        await tabs.first_visible_tab("https://missing")


def test_tab_mapper_replaces_group_identity_and_rejects_incomplete_data() -> None:
    assigned = tab().model_copy(update={"group_id": "group"})
    view = mapper.to_view(assigned, [group()])
    assert view.group == "Group"
    assert "id" not in view.model_dump(mode="json", by_alias=True)
    assert "position" not in view.model_dump(mode="json", by_alias=True)

    with pytest.raises(MCPClientError, match="Group"):
        mapper.to_view(assigned, [])

    incomplete = TabProjectionDTO(url="https://exact")
    response = PaginatedResponseDTO[TabDTO | TabProjectionDTO](data=[incomplete])
    with pytest.raises(MCPClientError, match="incomplete"):
        mapper.to_page(response, [])
