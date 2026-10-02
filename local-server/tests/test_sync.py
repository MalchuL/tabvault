"""Exercise transactional sync and stale-client recovery through authenticated HTTP."""

from copy import deepcopy

from fastapi.testclient import TestClient


def change(kind, identity, data, instant="2030-01-01T00:00:00Z"):
    return {
        "kind": kind,
        "id": identity,
        "token": f"{kind}:{identity}:{instant}",
        "updatedAt": instant,
        "data": data,
    }


def sync(client, headers, changes=(), generation=None):
    return client.post(
        "/api/v1/sync",
        headers=headers,
        json={"schemaVersion": 5, "generation": generation, "changes": list(changes)},
    )


def tab(identity="t", group="g"):
    return {
        "id": identity,
        "content": {"title": "Exact URL", "url": "HTTPS://Example.com/path?x=1#anchor"},
        "placement": {"groupId": group, "position": 2},
        "annotations": {"customProperties": {"priority": 7}, "tags": ["Docs"]},
    }


def initial(client, headers):
    result = sync(
        client,
        headers,
        [
            change("tab", "t", tab()),
            change("group", "g", {"id": "g", "details": {"name": "Group", "category": "manual"}}),
            change("tag", "docs", {"name": "Docs", "description": "Links"}),
            change("property", "priority", {"description": "Rank", "type": "int", "default": 0}),
        ],
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_atomic_sync_lww_replay_and_property_reset(client: TestClient, headers):
    first = initial(client, headers)
    assert len(first["acknowledged"]) == 4
    saved = first["document"]["library"]["tabs"][0]
    assert saved["content"]["url"] == tab()["content"]["url"]
    assert saved["annotations"]["customProperties"] == {"priority": 7}
    stale = tab()
    stale["content"]["title"] = "stale"
    response = sync(client, headers, [change("tab", "t", stale)], first["generation"])
    assert response.json()["document"]["library"]["tabs"][0]["content"]["title"] == "Exact URL"
    invalid = deepcopy(tab("bad"))
    invalid["annotations"]["customProperties"]["priority"] = "bad"
    result = sync(
        client,
        headers,
        [change("tag", "rollback", {"name": "rollback"}), change("tab", "bad", invalid)],
    )
    assert result.status_code == 422, result.text
    assert not any(
        t["name"] == "rollback" for t in sync(client, headers).json()["document"]["library"]["tags"]
    )
    saved["annotations"]["customProperties"] = {}
    reset = sync(client, headers, [change("tab", "t", saved, "2031-01-01T00:00:00Z")]).json()
    assert reset["document"]["library"]["tabs"][0]["annotations"]["customProperties"] == {}
    assert (
        client.get("/api/v1/tabs/t", headers=headers).json()["data"]["annotations"][
            "customProperties"
        ]["priority"]
        == 0
    )


def test_tombstones_block_resurrection_and_archive_group_members(client, headers):
    initial(client, headers)
    deleted = sync(
        client,
        headers,
        [
            change("group", "g", None, "2031-01-01T00:00:00Z"),
            change("tag", "docs", None, "2031-01-01T00:00:00Z"),
            change("property", "priority", None, "2031-01-01T00:00:00Z"),
        ],
    )
    assert deleted.status_code == 200, deleted.text
    saved = deleted.json()["document"]["library"]["tabs"][0]
    assert saved["placement"]["groupId"] is None and saved["lifecycle"]["archived"]
    assert saved["annotations"]["tags"] == []
    assert saved["annotations"]["customProperties"] == {"priority": 7}
    replay = sync(client, headers, [change("tab", "t", tab(), "2032-01-01T00:00:00Z")])
    assert replay.status_code == 200, replay.text
    saved = replay.json()["document"]["library"]["tabs"][0]
    assert saved["lifecycle"]["archived"] and saved["annotations"]["tags"] == []
    assert (
        sync(client, headers, [change("tab", "t", None, "2033-01-01T00:00:00Z")]).status_code == 200
    )
    assert (
        sync(client, headers, [change("tab", "t", tab(), "2034-01-01T00:00:00Z")]).json()[
            "document"
        ]["library"]["tabs"]
        == []
    )
    recreated = sync(
        client, headers, [change("tag", "docs", {"name": "Docs"}, "2034-01-01T00:00:00Z")]
    )
    assert recreated.status_code == 200, recreated.text
    assert recreated.json()["document"]["library"]["tags"][0]["name"] == "Docs"


def test_generation_reset_and_direct_restore(client, headers):
    first = initial(client, headers)
    cleared = client.delete("/api/v1/library", headers=headers)
    assert cleared.status_code == 200
    downloaded = client.get(
        f"/api/v1/backups/{cleared.json()['data']['backupSnapshotId']}/download", headers=headers
    )
    assert downloaded.status_code == 200 and downloaded.json()["library"]["tabs"][0]["id"] == "t"
    assert client.get("/api/v1/backups/missing/download", headers=headers).status_code == 404
    assert (
        sync(client, headers, [change("tab", "t", tab())], first["generation"]).status_code == 409
    )
    empty = sync(client, headers).json()
    assert empty["generation"] != first["generation"] and empty["document"]["library"]["tabs"] == []
    restored = client.post(
        f"/api/v1/backups/{cleared.json()['data']['backupSnapshotId']}/restore", headers=headers
    )
    assert restored.status_code == 200, restored.text
    assert sync(client, headers).json()["document"]["library"]["tabs"][0]["id"] == "t"
    assert sync(client, headers, [], empty["generation"]).status_code == 409


def test_sync_boundary_and_removed_routes(client, headers):
    assert sync(client, {}, []).status_code == 401
    entry = change("tag", "t", {"name": "t"})
    assert sync(client, headers, [entry, entry]).status_code == 422
    entry["updatedAt"] = "2030-01-01T00:00:00"
    assert sync(client, headers, [entry]).status_code == 422
    for path in ("/jobs", "/index/status", "/tabs/t/preview", "/assets/a"):
        assert client.get("/api/v1" + path, headers=headers).status_code == 404
    assert (
        client.post(
            "/api/v1/search", headers=headers, json={"q": "x", "mode": "semantic"}
        ).status_code
        == 422
    )
