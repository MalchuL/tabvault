"""Generic property tools retain the existing visible-occurrence boundary."""

from types import SimpleNamespace

import pytest
from factories import tab

from mcp_tabvault.client.dto import PropertyDefinitionDTO, PropertySchemaResponseDTO, TabResponseDTO
from mcp_tabvault.domain.tabs import tools


@pytest.mark.anyio
async def test_property_tools_use_generic_client_and_visible_resolution(monkeypatch):
    calls = []
    schema = PropertySchemaResponseDTO.model_validate({"data": {"properties": {}}})

    async def read():
        calls.append("read")
        return schema

    async def define(body):
        calls.append(("define", body.name))
        return schema

    async def delete(name):
        calls.append(("delete", name))
        return schema

    async def unset(identity, names):
        calls.append(("unset", identity, names))
        return TabResponseDTO(data=tab())

    async def visible(url):
        assert url == "https://exact"
        calls.append("visible")
        return tab()

    async def groups():
        return []

    monkeypatch.setattr(
        tools,
        "get_client",
        lambda: SimpleNamespace(
            property_schema=read,
            upsert_property=define,
            delete_property=delete,
            unset_properties=unset,
        ),
    )
    monkeypatch.setattr(tools.utils, "first_visible_tab", visible)
    monkeypatch.setattr(tools.group_utils, "visible_groups", groups)
    assert await tools.property_schema() == schema
    assert (
        await tools.define_property(PropertyDefinitionDTO(name="priority", type="int", default=3))
        == schema
    )
    assert await tools.delete_property("priority") == schema
    result = await tools.unset_properties("https://exact", ["priority"])
    assert result.data.content.url == "https://exact"
    assert calls == [
        "read",
        ("define", "priority"),
        ("delete", "priority"),
        "visible",
        ("unset", "tab", ["priority"]),
    ]
