from __future__ import annotations

import ast
from pathlib import Path

import pytest
from pydantic import ValidationError

from config.settings import Settings
from db.session import configure_database, dispose_database
from domain.groups.dto import GroupCreateDTO, GroupDTO, GroupUpdateDTO
from domain.groups.mapper import GroupMapper
from domain.system.dto import TransferGroupDTO, TransferTabDTO
from domain.system.mapper import SystemMapper
from domain.system.repository import SystemRepository
from domain.tabs.dto import (
    TabBatchCreateDTO,
    TabCreateDTO,
    TabListOptionsDTO,
    TabUpdateDTO,
)
from domain.tabs.mapper import TabMapper
from domain.tabs.repository import TabRepository
from domain.tags.dto import TagUpsertDTO
from domain.tags.mapper import TagMapper
from lib.responses import json_data, success
from models import Base


def test_nested_dtos_literals_aliases_and_response_envelope() -> None:
    with pytest.raises(ValidationError):
        TabBatchCreateDTO.model_validate({"tabs": [{"title": "Missing URL"}]})
    with pytest.raises(ValidationError):
        TabCreateDTO.model_validate({"url": "https://example.com", "unknown": True})
    with pytest.raises(ValidationError):
        TabListOptionsDTO(sortBy="unsupported")

    body = TabBatchCreateDTO.model_validate(
        {"tabs": [{"url": "https://example.com", "groupId": "group"}]}
    )
    assert isinstance(body.tabs[0], TabCreateDTO)
    assert body.tabs[0].group_id == "group"
    assert json_data(success(body))["data"]["tabs"][0]["groupId"] == "group"
    assert set(json_data(success(body))) == {"success", "data"}


def test_recursive_group_and_core_mapper_conversions() -> None:
    child = GroupDTO(
        id="child",
        name="Child",
        parent_id="parent",
        color=None,
        position=1,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    parent = child.model_copy(
        update={"id": "parent", "name": "Parent", "parent_id": None, "children": [child]}
    )
    assert parent.children and parent.children[0].id == "child"

    group = GroupMapper.from_create_dto(GroupCreateDTO(name="Mapped"), 3)
    assert group.name == "Mapped" and group.position == 3
    assert GroupMapper.to_update_dict(GroupUpdateDTO(color="blue")) == {"color": "blue"}

    tag = TagMapper.from_upsert_dto("docs", TagUpsertDTO(description="Docs"))
    assert tag.name == "docs"
    assert TagMapper.to_update_dict(TagUpsertDTO(description=None))["description"] is None

    tab = TabMapper.from_create_dto(
        TabCreateDTO(id="mapped", url="https://example.com", title="Mapped"),
        normalized_url="https://example.com",
        group_id=None,
        position=0,
        tags=[tag],
    )
    assert TabMapper.to_dto(tab).tags == ["docs"]
    assert TabMapper.to_update_dict(TabUpdateDTO(note=None)) == {"note": None}
    assert set(
        TabMapper.to_projection(tab, "minimal").model_dump(exclude_unset=True, by_alias=True)
    ) == {"id", "url", "title", "favicon", "groupId", "tags"}


def test_transfer_mapper_creates_models_and_update_values() -> None:
    mapper = SystemMapper()
    group_dto = TransferGroupDTO(id="group", name="Group", position=2)
    group = mapper.group_from_transfer(group_dto)
    assert group.id == "group"
    assert mapper.group_transfer_changes(group_dto)["position"] == 2

    tab_dto = TransferTabDTO(
        id="tab", url="https://example.com", title="Tab", group_id="group", tags=[]
    )
    tab = mapper.tab_from_transfer(tab_dto, "https://example.com", [])
    assert tab.id == "tab" and tab.group_id == "group"


def test_services_and_controllers_keep_database_operations_in_repositories() -> None:
    source_root = Path(__file__).parents[1] / "src"
    for path in [
        *source_root.glob("domain/*/service.py"),
        *source_root.glob("domain/*/controller.py"),
        source_root / "domain/system/preview.py",
        source_root / "domain/system/transfer.py",
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
async def test_repositories_persist_mapped_models(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'repository.db'}",
    )
    engine, factory = configure_database(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        tabs = TabRepository(db)
        tab = TabMapper.from_create_dto(
            TabCreateDTO(url="https://example.com/repository"),
            normalized_url="https://example.com/repository",
            group_id=None,
            position=await tabs.next_position(None),
            tags=await tabs.resolve_tags(["docs"]),
        )
        await tabs.add_tab(tab)
        await db.commit()
        assert (await tabs.get(tab.id)) is not None
        assert await SystemRepository(db).health_counts() == (1, 0, 1)
    await dispose_database()
