from __future__ import annotations

import ast
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from config.settings import Settings
from db.session import configure_database, dispose_database
from domain.groups.dto import GroupCreateDTO, GroupUpdateDTO
from domain.groups.mapper import GroupMapper
from domain.system.repository import SystemRepository
from domain.tabs.dto import TabCreateDTO, TabListOptionsDTO, TabUpdateDTO
from domain.tabs.mapper import TabMapper
from domain.tabs.repository import TabRepository
from domain.tags.dto import TagUpsertDTO
from domain.tags.mapper import TagMapper
from domain.transfer.dto import TransferGroupDTO, TransferTabDTO
from domain.transfer.mapper import TransferMapper
from lib.pagination import ListOptions, Page, PaginatedResponse
from lib.responses import json_data, success
from lib.time import utc_now
from models import Base


def test_single_tab_dto_preserves_url_and_uses_camel_case_aliases() -> None:
    with pytest.raises(ValidationError):
        TabCreateDTO.model_validate({"title": "Missing URL"})
    with pytest.raises(ValidationError):
        TabCreateDTO.model_validate({"url": "file:///tmp/example"})
    with pytest.raises(ValidationError):
        TabCreateDTO.model_validate({"url": "https://example.com", "unknown": True})
    with pytest.raises(ValidationError):
        TabListOptionsDTO(sortBy="unsupported")

    original = "HTTPS://Example.COM/path?q=One#Fragment"
    body = TabCreateDTO.model_validate({"url": original, "groupId": "group"})
    assert body.url == original
    assert body.group_id == "group"
    assert body.note == ""
    assert body.agent_review == ""
    assert body.custom_properties == {}
    assert json_data(success(body))["data"]["groupId"] == "group"


def test_shared_pagination_validates_and_maps_pages() -> None:
    with pytest.raises(ValidationError):
        ListOptions(limit=101)
    page = Page(data=[1, 2], has_next=True, total=3).map(str)
    response = PaginatedResponse.from_page(page)
    assert response.model_dump(by_alias=True) == {
        "data": ["1", "2"],
        "hasNext": True,
        "size": 2,
        "total": 3,
    }


def test_flat_group_and_core_mapper_conversions() -> None:
    group = GroupMapper.from_create_dto(GroupCreateDTO(name="Mapped", category="custom"), 3)
    assert group.name == "Mapped"
    assert group.category == "custom"
    assert group.position == 3
    assert GroupMapper.to_update_dict(GroupUpdateDTO(category="manual")) == {"category": "manual"}

    tag = TagMapper.from_upsert_dto("docs", TagUpsertDTO(description="Docs"))
    tab = TabMapper.from_create_dto(
        TabCreateDTO(id="mapped", url="https://example.com/?x=1#anchor", title="Mapped"),
        group_id=None,
        position=0,
        tags=[tag],
    )
    tab.created_at = tab.updated_at = utc_now()
    assert tab.url == "https://example.com/?x=1#anchor"
    mapped = TabMapper.to_dto(tab, {"viewed": False})
    assert mapped.tags == ["docs"]
    naive = tab.created_at.replace(tzinfo=None)
    tab.created_at = tab.updated_at = naive
    serialized = TabMapper.to_dto(tab, {"viewed": False}).model_dump(mode="json", by_alias=True)
    assert serialized["createdAt"].endswith("Z")
    assert serialized["updatedAt"].endswith("Z")
    assert TabMapper.to_update_dict(TabUpdateDTO(note=None)) == {"note": ""}
    assert set(
        TabMapper.to_projection(tab, "minimal", {"viewed": False}).model_dump(
            exclude_unset=True, by_alias=True
        )
    ) == {"id", "url", "title", "favicon", "groupId", "tags"}


def test_transfer_mapper_uses_schema_v3_fields() -> None:
    mapper = TransferMapper()
    group_dto = TransferGroupDTO(id="group", name="Group", category="session", position=2)
    group = mapper.group_from_dto(group_dto)
    assert group.category == "session"
    assert mapper.group_changes(group_dto)["category"] == "session"

    tab_dto = TransferTabDTO(
        id="tab", url="https://example.com/?a=1#b", title="Tab", group_id="group", tags=[]
    )
    tab = mapper.tab_from_dto(tab_dto, [])
    assert tab.url == tab_dto.url
    assert tab.group_id == "group"
    assert tab.note == "" and tab.agent_review == "" and tab.custom_properties == {}

    naive_group = TransferGroupDTO.model_validate(
        {
            "id": "group",
            "name": "Group",
            "category": "session",
            "updatedAt": "2026-08-29T20:37:37.346680",
        }
    )
    assert naive_group.updated_at == datetime.fromisoformat("2026-08-29T20:37:37.346680+00:00")
    assert naive_group.model_dump(mode="json", by_alias=True)["updatedAt"].endswith("Z")


def test_services_and_controllers_keep_database_operations_in_repositories() -> None:
    source_root = Path(__file__).parents[1] / "src"
    for path in [
        *source_root.glob("domain/*/service.py"),
        *source_root.glob("domain/*/controller.py"),
        source_root / "domain/previews/service.py",
        source_root / "domain/transfer/service.py",
    ]:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        assert not any(
            isinstance(node, (ast.Import, ast.ImportFrom))
            and (
                any(alias.name.startswith("sqlalchemy") for alias in node.names)
                if isinstance(node, ast.Import)
                else (node.module or "").startswith("sqlalchemy.sql")
            )
            for node in ast.walk(tree)
        ), path
        if path.name in {"service.py", "preview.py", "transfer.py"}:
            db_methods = {
                node.func.attr
                for node in ast.walk(tree)
                if isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Attribute)
                and isinstance(node.func.value.value, ast.Name)
                and node.func.value.value.id == "self"
                and node.func.value.attr == "db"
            }
            assert db_methods <= {"commit", "rollback"}, (path, db_methods)


@pytest.mark.asyncio
async def test_repositories_persist_exact_saved_url(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'repository.db'}",
    )
    engine, factory = configure_database(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        tabs = TabRepository(db)
        original = "https://example.com/repository?x=1#section"
        tab = TabMapper.from_create_dto(
            TabCreateDTO(url=original),
            group_id=None,
            position=await tabs.next_position(None),
            tags=await tabs.resolve_tags(["docs"]),
        )
        await tabs.add_tab(tab)
        await db.commit()
        loaded = await tabs.get(tab.id)
        assert loaded is not None and loaded.url == original
        assert await SystemRepository(db).health_counts(utc_now()) == (1, 0, 1)
    await dispose_database()
