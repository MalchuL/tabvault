from __future__ import annotations

from typing import Any

import pytest
from factories import NOW, group, tab, tag

from mcp_tabvault.client.dto import (
    GroupDeleteResponseDTO,
    GroupDeleteResultDTO,
    GroupListResponseDTO,
    GroupResponseDTO,
    SearchDataDTO,
    SearchItemDTO,
    SearchMetaDTO,
    SearchResponseDTO,
    TabCreateResponseDTO,
    TabDeleteResponseDTO,
    TabDeleteResultDTO,
    TabListResponseDTO,
    TabResponseDTO,
    TagListResponseDTO,
)
from mcp_tabvault.domain.groups import tools as group_tools
from mcp_tabvault.domain.tabs import tools as tab_tools
from mcp_tabvault.domain.tags import tools as tag_tools


class ToolClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []
        self.assigned = tab("oldest").model_copy(update={"group_id": "group"})
        self.unassigned = tab("other", "https://other")

    async def list_groups(self, query: Any) -> GroupListResponseDTO:
        self.calls.append(("list_groups", query))
        return GroupListResponseDTO(data=[group()])

    async def list_tabs(self, query: Any) -> TabListResponseDTO:
        self.calls.append(("list_tabs", query))
        return TabListResponseDTO(data=[self.assigned, self.unassigned])

    async def search_tabs(self, query: Any) -> SearchResponseDTO:
        self.calls.append(("search_tabs", query))
        return SearchResponseDTO(
            data=SearchDataDTO(
                results=[
                    SearchItemDTO(
                        tab=self.assigned, score=1, match_type="keyword", matched_on="title"
                    ),
                    SearchItemDTO(
                        tab=self.unassigned, score=0.5, match_type="keyword", matched_on="url"
                    ),
                ]
            ),
            meta=SearchMetaDTO(query_embedding_ms=1, search_ms=2),
        )

    async def create_tab(self, body: Any) -> TabCreateResponseDTO:
        self.calls.append(("create_tab", body))
        return TabCreateResponseDTO(data=self.assigned.model_copy(update={"url": body.url}))

    async def update_tab(self, tab_id: str, body: Any) -> TabResponseDTO:
        self.calls.append(("update_tab", (tab_id, body)))
        changes: dict[str, object] = {}
        if "url" in body.model_fields_set:
            changes["url"] = body.url
        if "group_id" in body.model_fields_set:
            changes["group_id"] = body.group_id
        return TabResponseDTO(data=self.assigned.model_copy(update=changes))

    async def delete_tab(self, tab_id: str) -> TabDeleteResponseDTO:
        self.calls.append(("delete_tab", tab_id))
        return TabDeleteResponseDTO(data=TabDeleteResultDTO(id=tab_id, deleted_at=NOW, hard=False))

    async def list_group_tabs(self, group_id: str, query: Any) -> TabListResponseDTO:
        self.calls.append(("list_group_tabs", (group_id, query)))
        return TabListResponseDTO(data=[])

    async def create_group(self, body: Any) -> GroupResponseDTO:
        self.calls.append(("create_group", body))
        return GroupResponseDTO(data=group().model_copy(update={"name": body.name}))

    async def update_group(self, group_id: str, body: Any) -> GroupResponseDTO:
        self.calls.append(("update_group", (group_id, body)))
        return GroupResponseDTO(data=group().model_copy(update={"name": body.name or "Group"}))

    async def delete_group(self, group_id: str) -> GroupDeleteResponseDTO:
        self.calls.append(("delete_group", group_id))
        return GroupDeleteResponseDTO(
            data=GroupDeleteResultDTO(id=group_id, archived_tab_count=2, deleted_at=NOW)
        )

    async def list_tags(self, query: Any) -> TagListResponseDTO:
        self.calls.append(("list_tags", query))
        return TagListResponseDTO(data=[tag()])

    async def tag_tab(self, tab_id: str, body: Any) -> TabResponseDTO:
        self.calls.append(("tag_tab", (tab_id, body)))
        return TabResponseDTO(data=self.assigned)

    async def untag_tab(self, tab_id: str, tag_name: str) -> TabResponseDTO:
        self.calls.append(("untag_tab", (tab_id, tag_name)))
        return TabResponseDTO(data=self.assigned)


@pytest.mark.anyio
async def test_every_tool_uses_human_selectors_and_returns_one_id_free_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = ToolClient()
    monkeypatch.setattr(tab_tools, "get_client", lambda: client)
    monkeypatch.setattr(tab_tools.utils, "get_client", lambda: client)
    monkeypatch.setattr(group_tools, "get_client", lambda: client)
    monkeypatch.setattr(group_tools.utils, "get_client", lambda: client)
    monkeypatch.setattr(tag_tools, "get_client", lambda: client)
    monkeypatch.setattr(tag_tools.tab_utils, "get_client", lambda: client)
    monkeypatch.setattr(tag_tools.group_utils, "get_client", lambda: client)

    listed = await tab_tools.list_tabs(group="group")
    unassigned = await tab_tools.list_tabs(unassignedOnly=True)
    searched = await tab_tools.search_tabs("query", group="Group")
    searched_unassigned = await tab_tools.search_tabs("query", unassignedOnly=True)
    fetched = await tab_tools.get_tab("https://exact")
    saved = await tab_tools.save_tab("https://new", group="GROUP")
    updated = await tab_tools.update_tab("https://exact", newUrl="https://changed")
    deleted = await tab_tools.delete_tab("https://exact")
    moved = await tab_tools.move_tab("https://exact", targetGroup="Group")
    unassigned_move = await tab_tools.move_tab("https://exact")

    groups = await group_tools.list_groups()
    fetched_group = await group_tools.get_group("group")
    created_group = await group_tools.create_group("New")
    updated_group = await group_tools.update_group("GROUP", newName="Renamed")
    deleted_group = await group_tools.delete_group("group")

    tags = await tag_tools.list_tags()
    tagged = await tag_tools.tag_tab("https://exact", "docs")
    untagged = await tag_tools.untag_tab("https://exact", "docs")

    assert listed.data[0].group == "Group"
    assert unassigned.data[1].group is None
    assert searched.data.results[0].tab.group == "Group"
    assert [item.tab.url for item in searched_unassigned.data.results] == ["https://other"]
    assert fetched.data.url == "https://exact"
    assert saved.data.url == "https://new"
    assert updated.data.url == "https://changed"
    assert deleted.data.url == "https://exact"
    assert moved.data.group == "Group" and unassigned_move.data.group is None
    assert groups.data[0].name == fetched_group.data.name == "Group"
    assert created_group.data.name == "New" and updated_group.data.name == "Renamed"
    assert deleted_group.data.name == "Group" and deleted_group.data.archived_tab_count == 2
    assert tags.data[0].name == "docs"
    assert tagged.data.url == untagged.data.url == "https://exact"

    mutated_ids = [
        value[0] if isinstance(value, tuple) else value
        for name, value in client.calls
        if name in {"update_tab", "delete_tab", "tag_tab", "untag_tab"}
    ]
    assert set(mutated_ids) == {"oldest"}
