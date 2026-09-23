from __future__ import annotations

from fastapi.testclient import TestClient


def upsert_property(
    client: TestClient,
    headers: dict[str, str],
    name: str,
    property_type: str,
    default: object,
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
            "url": "https://example.com/custom",
            "title": "Custom",
            "customProperties": {"viewed": True},
        },
    )
    assert created.status_code == 201, created.text
    tab = created.json()["data"]
    assert tab["customProperties"] == {"viewed": True, "priority": 3}

    invalid = client.patch(
        f"/api/v1/tabs/{tab['id']}/custom-properties",
        headers=headers,
        json={"priority": "high", "viewed": False},
    )
    assert invalid.status_code == 422
    unchanged = client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).json()["data"]
    assert unchanged["customProperties"] == {"viewed": True, "priority": 3}

    changed = client.patch(
        f"/api/v1/tabs/{tab['id']}/custom-properties",
        headers=headers,
        json={"priority": 7},
    ).json()["data"]
    assert changed["customProperties"] == {"viewed": True, "priority": 7}

    result = client.post(
        "/api/v1/search",
        headers=headers,
        json={
            "query": "Custom",
            "mode": "keyword",
            "propertyFilters": [{"name": "priority", "operator": "gte", "value": 7}],
        },
    )
    assert [item["tab"]["id"] for item in result.json()["data"]["results"]] == [tab["id"]]

    unset = client.post(
        f"/api/v1/tabs/{tab['id']}/custom-properties/unset",
        headers=headers,
        json={"properties": ["priority"]},
    ).json()["data"]
    assert unset["customProperties"]["priority"] == 3


def test_schema_type_changes_validate_and_explicit_repair_converts_or_removes(
    client: TestClient, headers: dict[str, str]
) -> None:
    upsert_property(client, headers, "score", "string", "0")
    tab = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "url": "https://example.com/repair",
            "customProperties": {"score": "12"},
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
        client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).json()["data"]["customProperties"][
            "score"
        ]
        == 12
    )

    client.delete("/api/v1/property-schema/score", headers=headers)
    hidden = client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).json()["data"]
    assert "score" not in hidden["customProperties"]
    validation = client.get("/api/v1/property-schema/validation", headers=headers).json()["data"]
    assert validation["summary"]["undeclaredValues"] == 1
    repaired = client.post("/api/v1/property-schema/repair", headers=headers).json()["data"]
    assert repaired["removed"] == 1
