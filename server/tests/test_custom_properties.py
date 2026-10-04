from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from domain.custom_properties.repository import CustomPropertyRepository


def upsert_property(
    client: TestClient, headers: dict[str, str], name: str, property_type: str, default: object
) -> dict[str, object]:
    response = client.post(
        "/api/v1/property-schema",
        headers=headers,
        json={"name": name, "type": property_type, "default": default},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_defaults_partial_updates_unset_and_typed_search(
    client: TestClient, headers: dict[str, str]
) -> None:
    schema = client.get("/api/v1/property-schema", headers=headers).json()["data"]
    assert schema["properties"]["viewed"] == {
        "description": "",
        "type": "boolean",
        "default": False,
    }
    upsert_property(client, headers, "priority", "int", 3)
    created = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "content": {"url": "https://example.com/custom", "title": "Custom"},
            "annotations": {"customProperties": {"viewed": True}},
        },
    )
    assert created.status_code == 201, created.text
    tab = created.json()["data"]
    assert tab["annotations"]["customProperties"] == {"viewed": True, "priority": 3}
    invalid = client.patch(
        f"/api/v1/tabs/{tab['id']}/custom-properties",
        headers=headers,
        json={"priority": "high", "viewed": False},
    )
    assert invalid.status_code == 422
    unchanged = client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).json()["data"]
    assert unchanged["annotations"]["customProperties"] == {"viewed": True, "priority": 3}
    changed = client.patch(
        f"/api/v1/tabs/{tab['id']}/custom-properties", headers=headers, json={"priority": 7}
    ).json()["data"]
    assert changed["annotations"]["customProperties"] == {"viewed": True, "priority": 7}
    result = client.post(
        "/api/v1/search",
        headers=headers,
        json={
            "query": "Custom",
            "propertyFilters": [{"name": "priority", "operator": "gte", "value": 7}],
        },
    )
    assert [item["tab"]["id"] for item in result.json()["data"]["results"]] == [tab["id"]]
    unset = client.post(
        f"/api/v1/tabs/{tab['id']}/custom-properties/unset",
        headers=headers,
        json={"properties": ["priority"]},
    ).json()["data"]
    assert unset["annotations"]["customProperties"]["priority"] == 3


def test_schema_type_changes_validate_and_explicit_repair_converts_or_removes(
    client: TestClient, headers: dict[str, str]
) -> None:
    upsert_property(client, headers, "score", "string", "0")
    tab = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "content": {"url": "https://example.com/repair"},
            "annotations": {"customProperties": {"score": "12"}},
        },
    ).json()["data"]
    upsert_property(client, headers, "score", "int", 0)
    validation = client.get("/api/v1/property-schema/validation", headers=headers).json()["data"]
    assert validation["valid"] is False
    assert validation["summary"]["invalidValues"] == 1
    assert validation["issues"][0]["tabId"] == tab["id"]
    repaired = client.post("/api/v1/property-schema/repair", headers=headers).json()["data"]
    assert repaired["converted"] == 1
    assert (
        client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).json()["data"]["annotations"][
            "customProperties"
        ]["score"]
        == 12
    )
    client.delete("/api/v1/property-schema/score", headers=headers)
    hidden = client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).json()["data"]
    assert "score" not in hidden["annotations"]["customProperties"]
    validation = client.get("/api/v1/property-schema/validation", headers=headers).json()["data"]
    assert validation["summary"]["undeclaredValues"] == 1
    repaired = client.post("/api/v1/property-schema/repair", headers=headers).json()["data"]
    assert repaired["removed"] == 1


def test_keyed_deletion_distinguishes_one_tab_from_the_entire_library(client, headers) -> None:
    upsert_property(client, headers, "payload", "json", {"default": True})
    tabs = []
    for index in range(3):
        response = client.post(
            "/api/v1/tabs",
            headers=headers,
            json={
                "content": {"url": f"https://example.com/remove/{index}"},
                "annotations": {"customProperties": {"payload": None, "viewed": True}},
            },
        )
        assert response.status_code == 201
        tabs.append(response.json()["data"])
    path = f"/api/v1/tabs/{tabs[0]['id']}/custom-properties/payload"
    assert client.delete(path).status_code == 401
    removed = client.delete(path, headers=headers)
    assert removed.status_code == 200
    assert removed.json()["data"]["annotations"]["customProperties"]["payload"] == {"default": True}
    snapshot = client.get("/api/v1/sync", headers=headers).json()
    raw = {tab["id"]: tab["annotations"]["customProperties"] for tab in snapshot["library"]["tabs"]}
    assert "payload" not in raw[tabs[0]["id"]]
    assert raw[tabs[1]["id"]]["payload"] is None
    assert "payload" in snapshot["propertySchema"]
    assert client.delete(path, headers=headers).status_code == 200
    assert (
        client.delete("/api/v1/tabs/missing/custom-properties/payload", headers=headers).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/tabs/{tabs[1]['id']}",
            headers=headers,
            json={"lifecycle": {"hiddenUntil": "2099-01-01T00:00:00Z"}},
        ).status_code
        == 200
    )
    assert client.delete(f"/api/v1/tabs/{tabs[2]['id']}", headers=headers).status_code == 200
    global_path = "/api/v1/property-schema/values/payload"
    assert client.delete(global_path).status_code == 401
    assert client.delete(global_path, headers=headers).status_code == 200
    snapshot = client.get("/api/v1/sync", headers=headers).json()
    assert "payload" not in snapshot["propertySchema"]
    for tab in snapshot["library"]["tabs"]:
        assert "payload" not in tab["annotations"]["customProperties"]
        assert tab["annotations"]["customProperties"]["viewed"] is True
    assert client.delete(global_path, headers=headers).status_code == 200


def test_global_property_deletion_rolls_back_raw_values_when_persistence_fails(
    client, headers, monkeypatch
) -> None:
    upsert_property(client, headers, "score", "int", 0)
    tab = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "content": {"url": "https://example.com/rollback"},
            "annotations": {"customProperties": {"score": 7}},
        },
    ).json()["data"]

    async def fail_delete(self, row) -> None:
        raise RuntimeError("disposable persistence failure")

    monkeypatch.setattr(CustomPropertyRepository, "delete_definition", fail_delete)
    with pytest.raises(RuntimeError, match="disposable persistence failure"):
        client.delete("/api/v1/property-schema/values/score", headers=headers)
    snapshot = client.get("/api/v1/sync", headers=headers).json()
    assert "score" in snapshot["propertySchema"]
    stored = next(item for item in snapshot["library"]["tabs"] if item["id"] == tab["id"])
    assert stored["annotations"]["customProperties"]["score"] == 7


def test_global_property_deletion_also_removes_undeclared_values(client, headers) -> None:
    upsert_property(client, headers, "oldKey", "int", 0)
    client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "content": {"url": "https://example.com/undeclared"},
            "annotations": {"customProperties": {"oldKey": 7}},
        },
    )
    assert client.delete("/api/v1/property-schema/oldKey", headers=headers).status_code == 200
    assert (
        client.delete("/api/v1/property-schema/values/oldKey", headers=headers).status_code == 200
    )
    snapshot = client.get("/api/v1/sync", headers=headers).json()
    assert all(
        "oldKey" not in tab["annotations"]["customProperties"]
        for tab in snapshot["library"]["tabs"]
    )
