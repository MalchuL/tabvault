from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def create_group(client: TestClient, headers: dict[str, str], name: str = "Research") -> str:
    response = client.post("/api/v1/groups", headers=headers, json={"name": name})
    assert response.status_code == 201
    return response.json()["data"]["id"]


def create_tab(
    client: TestClient,
    headers: dict[str, str],
    url: str = "https://example.com/article",
    group_id: str | None = None,
) -> dict:
    response = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={"tabs": [{"url": url, "title": "Example", "groupId": group_id}]},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["created"][0]


def test_auth_prefix_health_and_error_envelope(client: TestClient, headers: dict[str, str]) -> None:
    assert client.get("/api/v1/health").status_code == 401
    assert client.get("/v1/tabs", headers=headers).status_code == 404
    health = client.get("/api/v1/health", headers=headers)
    assert health.status_code == 200
    assert health.json()["schemaVersion"] == 1
    invalid = client.post("/api/v1/groups", headers=headers, json={})
    assert invalid.status_code == 422
    assert invalid.json()["success"] is False
    assert invalid.json()["errors"][0]["path"] == "body.name"


def test_selected_group_persists_and_empty_groups_are_listed(
    client: TestClient, headers: dict[str, str]
) -> None:
    group_id = create_group(client, headers)
    create_group(client, headers, "Empty")
    tab = create_tab(client, headers, group_id=group_id)
    assert tab["groupId"] == group_id
    assert tab["note"] == ""
    assert tab["agentReview"] == ""
    assert tab["viewed"] is False
    loaded = client.get(f"/api/v1/tabs/{tab['id']}", headers=headers)
    assert loaded.json()["data"]["groupId"] == group_id
    groups = client.get("/api/v1/groups?flat=true", headers=headers).json()["data"]["groups"]
    assert {group["name"] for group in groups} == {"Research", "Empty"}


def test_batch_statuses_validation_aggregation_and_dedupe(
    client: TestClient, headers: dict[str, str]
) -> None:
    mixed = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={"tabs": [{"url": "https://example.com/good"}, {"url": "file:///bad"}]},
    )
    assert mixed.status_code == 207
    assert len(mixed.json()["data"]["created"]) == 1
    assert mixed.json()["errors"][0]["code"] == "E_INVALID_URL"

    atomic = client.post(
        "/api/v1/tabs?atomic=true",
        headers=headers,
        json={"tabs": [{"url": "https://example.com/atomic"}, {"url": "bad"}]},
    )
    assert atomic.status_code == 422
    assert atomic.json()["data"]["created"] == []

    duplicate = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={"tabs": [{"url": "https://example.com/good"}]},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["data"]["created"][0]["wasDuplicate"] is True


def test_cursor_projection_limit_warning_and_stability(
    client: TestClient, headers: dict[str, str]
) -> None:
    for index in range(4):
        create_tab(client, headers, f"https://example.com/{index}")
    first = client.get(
        "/api/v1/tabs?limit=2&sortBy=createdAt&fields=minimal", headers=headers
    ).json()
    assert len(first["data"]["tabs"]) == 2
    assert "note" not in first["data"]["tabs"][0]
    second = client.get(
        f"/api/v1/tabs?limit=2&sortBy=createdAt&fields=minimal&cursor={first['meta']['nextCursor']}",
        headers=headers,
    ).json()
    assert set(item["id"] for item in first["data"]["tabs"]).isdisjoint(
        item["id"] for item in second["data"]["tabs"]
    )
    capped = client.get("/api/v1/tabs?limit=500", headers=headers).json()
    assert capped["warnings"][0]["code"] == "W_LIMIT_CAPPED"


def test_idempotency_replay_and_conflict(client: TestClient, headers: dict[str, str]) -> None:
    key = str(uuid.uuid4())
    request_headers = {**headers, "Idempotency-Key": key}
    first = client.post("/api/v1/groups", headers=request_headers, json={"name": "Idempotent"})
    replay = client.post("/api/v1/groups", headers=request_headers, json={"name": "Idempotent"})
    conflict = client.post("/api/v1/groups", headers=request_headers, json={"name": "Different"})
    assert replay.status_code == first.status_code == 201
    assert replay.json() == first.json()
    assert conflict.status_code == 409
    assert conflict.json()["errors"][0]["code"] == "E_IDEMPOTENCY_CONFLICT"


def test_group_cycles_subgroups_moves_and_delete_strategies(
    client: TestClient, headers: dict[str, str]
) -> None:
    parent = create_group(client, headers, "Parent")
    child_response = client.post(
        "/api/v1/groups", headers=headers, json={"name": "Child", "parentId": parent}
    )
    child = child_response.json()["data"]["id"]
    tab = create_tab(client, headers, "https://example.com/child", child)
    scoped = client.get(f"/api/v1/groups/{parent}/tabs?includeSubgroups=true", headers=headers)
    assert [item["id"] for item in scoped.json()["data"]["tabs"]] == [tab["id"]]
    cycle = client.patch(f"/api/v1/groups/{parent}", headers=headers, json={"parentId": child})
    assert cycle.status_code == 409
    rejected = client.delete(
        f"/api/v1/groups/{parent}?strategy=reject_if_nonempty", headers=headers
    )
    assert rejected.status_code == 409
    moved = client.post(
        f"/api/v1/tabs/{tab['id']}/move",
        headers=headers,
        json={"targetGroupId": parent, "position": 0},
    )
    assert moved.json()["data"]["groupId"] == parent
    promoted = client.delete(f"/api/v1/groups/{parent}?strategy=promote", headers=headers)
    assert promoted.status_code == 200


def test_tags_archive_hard_delete_tombstone_and_restore(
    client: TestClient, headers: dict[str, str]
) -> None:
    tab = create_tab(client, headers)
    tagged = client.post(
        f"/api/v1/tabs/{tab['id']}/tags", headers=headers, json={"tagName": "Python"}
    )
    assert tagged.json()["data"]["tags"] == ["Python"]
    upsert = client.put("/api/v1/tags/python", headers=headers, json={"description": "Language"})
    assert upsert.json()["data"]["name"] == "Python"
    guarded = client.delete("/api/v1/tags/Python", headers=headers)
    assert guarded.status_code == 409
    assert client.delete(f"/api/v1/tabs/{tab['id']}?hard=true", headers=headers).status_code == 409
    assert client.delete(f"/api/v1/tabs/{tab['id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/tabs/{tab['id']}?hard=true", headers=headers).status_code == 200
    tab.pop("wasDuplicate")
    restored = client.post("/api/v1/tabs/restore", headers=headers, json=[tab])
    assert restored.json()["data"]["restored"] == 0


def test_search_keyword_jobs_preview_fallback_and_meta_routes(
    client: TestClient, headers: dict[str, str]
) -> None:
    tab = create_tab(client, headers, "https://example.com/python")
    client.patch(f"/api/v1/tabs/{tab['id']}", headers=headers, json={"note": "async python guide"})
    result = client.get("/api/v1/search?q=python&mode=keyword", headers=headers).json()
    assert result["data"]["results"][0]["matchType"] == "keyword"
    client.patch(
        f"/api/v1/tabs/{tab['id']}",
        headers=headers,
        json={"agentReview": "quantum filing summary"},
    )
    agent_result = client.get("/api/v1/search?q=quantum&mode=keyword", headers=headers).json()[
        "data"
    ]["results"][0]
    assert agent_result["matchedOn"] == "agentReview"
    queued = client.post("/api/v1/search/reindex", headers=headers)
    assert queued.status_code == 202
    job_id = queued.json()["data"]["jobId"]
    assert (
        client.get(f"/api/v1/jobs/{job_id}", headers=headers).json()["data"]["status"] == "pending"
    )
    preview = client.get(f"/api/v1/tabs/{tab['id']}/preview", headers=headers).json()
    assert preview["data"]["status"] == "pending"
    fallback = client.get("/api/v1/assets/missing", headers=headers)
    assert fallback.status_code == 200
    assert fallback.headers["content-type"].startswith("image/svg+xml")
    assert client.get("/api/v1/schema", headers=headers).status_code == 200
    assert client.get("/api/v1/errors", headers=headers).status_code == 200


def test_tab_update_filter_tag_move_batch_delete_and_not_found_errors(
    client: TestClient, headers: dict[str, str]
) -> None:
    first = create_tab(client, headers, "https://example.com/one")
    second = create_tab(client, headers, "https://example.com/two")
    assert client.patch(f"/api/v1/tabs/{first['id']}", headers=headers, json={}).status_code == 422
    assert (
        client.patch("/api/v1/tabs/missing", headers=headers, json={"title": "X"}).status_code
        == 404
    )
    updated = client.patch(
        f"/api/v1/tabs/{first['id']}",
        headers=headers,
        json={
            "title": "Changed",
            "note": None,
            "agentReview": "Agent summary",
            "viewed": True,
            "tags": ["alpha", "beta"],
        },
    ).json()["data"]
    assert updated["title"] == "Changed"
    assert updated["note"] == ""
    assert updated["agentReview"] == "Agent summary"
    assert updated["viewed"] is True
    assert (
        client.delete(f"/api/v1/tabs/{first['id']}/tags/alpha", headers=headers).status_code == 200
    )
    filtered = client.get(
        "/api/v1/tabs?tags=beta&tagsAll=beta&search=changed&sortBy=title&sortDir=desc",
        headers=headers,
    ).json()
    assert [item["id"] for item in filtered["data"]["tabs"]] == [first["id"]]
    batch = client.post(
        "/api/v1/tabs/batch-delete",
        headers=headers,
        json={"ids": [second["id"], "missing"], "hard": False},
    ).json()["data"]
    assert batch == {"deleted": [second["id"]], "notFound": ["missing"]}
    archived = client.get("/api/v1/tabs?includeArchived=true", headers=headers).json()
    assert any(item["id"] == second["id"] for item in archived["data"]["tabs"])
    assert client.get("/api/v1/tabs?cursor=broken", headers=headers).status_code == 422


def test_group_tree_counts_update_cascade_and_not_found(
    client: TestClient, headers: dict[str, str]
) -> None:
    parent = create_group(client, headers, "Parent")
    child = client.post(
        "/api/v1/groups", headers=headers, json={"name": "Child", "parentId": parent}
    ).json()["data"]["id"]
    create_tab(client, headers, "https://example.com/child-tab", child)
    tree = client.get("/api/v1/groups?includeDescendantCount=true", headers=headers).json()["data"][
        "groups"
    ]
    assert tree[0]["totalTabCount"] == 1
    renamed = client.patch(
        f"/api/v1/groups/{child}",
        headers=headers,
        json={"name": "Renamed", "description": "Agent filing context", "parentId": None},
    )
    assert renamed.json()["data"]["name"] == "Renamed"
    assert renamed.json()["data"]["description"] == "Agent filing context"
    assert (
        client.patch("/api/v1/groups/missing", headers=headers, json={"name": "X"}).status_code
        == 404
    )
    assert (
        client.delete(f"/api/v1/groups/{child}?strategy=cascade", headers=headers).status_code
        == 200
    )
    assert (
        client.delete("/api/v1/groups/missing?strategy=promote", headers=headers).status_code == 404
    )


def test_tag_catalog_markdown_detach_delete_and_missing(
    client: TestClient, headers: dict[str, str]
) -> None:
    tab = create_tab(client, headers)
    client.post(f"/api/v1/tabs/{tab['id']}/tags", headers=headers, json={"tagName": "Docs"})
    listing = client.get("/api/v1/tags", headers=headers).json()["data"]["tags"]
    assert listing[0]["tabCount"] == 1
    assert "Docs" in client.get("/api/v1/tags/export.md", headers=headers).text
    detached = client.delete("/api/v1/tags/docs?detachFromTabs=true", headers=headers)
    assert detached.status_code == 200
    assert client.delete("/api/v1/tags/docs", headers=headers).status_code == 404


def test_system_health_schedule_preview_refresh_search_degrade_and_errors(
    client: TestClient, headers: dict[str, str]
) -> None:
    tab = create_tab(client, headers)
    configured = client.put(
        "/api/v1/index/health-check",
        headers=headers,
        json={"intervalSeconds": 60, "notifyOnNeedsAttention": True},
    ).json()["data"]
    assert configured["enabled"] is True
    assert client.get("/api/v1/index/health-check", headers=headers).status_code == 200
    run = client.post("/api/v1/index/health-check/run", headers=headers).json()["data"]
    assert run["lastResult"] == "needs_attention"
    assert client.get("/api/v1/index/status", headers=headers).status_code == 200
    refreshed = client.post(f"/api/v1/tabs/{tab['id']}/preview/refresh", headers=headers)
    assert refreshed.status_code == 202
    assert client.post("/api/v1/tabs/missing/preview/refresh", headers=headers).status_code == 404
    assert client.get("/api/v1/tabs/missing/preview", headers=headers).status_code == 404
    hybrid = client.get("/api/v1/search?q=example&mode=hybrid", headers=headers).json()
    assert hybrid["warnings"][0]["code"] == "W_SEMANTIC_UNAVAILABLE"
    semantic = client.get("/api/v1/search?q=example&mode=semantic", headers=headers)
    assert semantic.status_code == 503
    assert client.get("/api/v1/jobs/missing", headers=headers).status_code == 404
    assert client.post("/api/v1/backups/missing/restore", headers=headers).status_code == 404


def test_import_envelope_markdown_scopes_replace_and_restore_job(
    client: TestClient, headers: dict[str, str]
) -> None:
    markdown = "## Notes\n\n- [One](https://example.com/one)\n  tags: note\n"
    imported = client.post(
        "/api/v1/import?mode=upload",
        headers={**headers, "Content-Type": "text/markdown"},
        content=markdown,
    )
    assert imported.status_code == 200
    exported = client.get(
        "/api/v1/export?format=json&scope=tag:note&fields=minimal", headers=headers
    ).json()
    assert len(exported["tabs"]) == 1
    document = client.get("/api/v1/export?format=json", headers=headers).json()
    replaced = client.post(
        "/api/v1/import",
        headers=headers,
        json={"mode": "replace", "format": "json", "content": document},
    )
    assert replaced.status_code == 200
    backup_id = replaced.json()["data"]["backupSnapshotId"]
    restore = client.post(f"/api/v1/backups/{backup_id}/restore", headers=headers)
    assert restore.status_code == 202
    missing_mode = client.post("/api/v1/import", headers=headers, json=document)
    assert missing_mode.status_code == 422


def test_remaining_tab_creation_update_move_restore_branches(
    client: TestClient, headers: dict[str, str]
) -> None:
    invalid_fields = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "tabs": [
                {"title": "Missing URL"},
                {"url": "https://example.com/not-created"},
            ]
        },
    )
    assert invalid_fields.status_code == 422
    assert client.get("/api/v1/tabs", headers=headers).json()["data"]["tabs"] == []
    invalid_group = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={"tabs": [{"url": "https://example.com", "groupId": "missing"}]},
    )
    assert invalid_group.status_code == 422
    first = create_tab(client, headers, "https://example.com/merge")
    client.delete(f"/api/v1/tabs/{first['id']}", headers=headers)
    merged = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "tabs": [
                {
                    "url": "https://example.com/merge",
                    "title": "Merged",
                    "note": "Note",
                    "tags": ["merged"],
                }
            ],
            "dedupeStrategy": "merge",
        },
    ).json()["data"]["created"][0]
    assert merged["archived"] is False
    assert merged["tags"] == ["merged"]
    explicit = client.post(
        "/api/v1/tabs",
        headers=headers,
        json={
            "tabs": [
                {
                    "id": "explicit-tab",
                    "url": "https://example.com/merge",
                    "position": 5,
                }
            ],
            "dedupeStrategy": "createAnyway",
        },
    )
    assert explicit.status_code == 201
    assert explicit.json()["data"]["created"][0]["id"] == "explicit-tab"
    assert (
        client.patch(
            f"/api/v1/tabs/{first['id']}", headers=headers, json={"groupId": "missing"}
        ).status_code
        == 409
    )
    client.patch(f"/api/v1/tabs/{first['id']}", headers=headers, json={"archived": True})
    unarchived = client.patch(
        f"/api/v1/tabs/{first['id']}", headers=headers, json={"archived": False, "groupId": "inbox"}
    ).json()["data"]
    assert unarchived["archivedAt"] is None
    assert client.delete("/api/v1/tabs/missing", headers=headers).status_code == 404
    assert (
        client.post(
            f"/api/v1/tabs/{first['id']}/move",
            headers=headers,
            json={"targetGroupId": "missing"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/v1/tabs/missing/move", headers=headers, json={"targetGroupId": None}
        ).status_code
        == 404
    )
    client.post(
        f"/api/v1/tabs/{explicit.json()['data']['created'][0]['id']}/move",
        headers=headers,
        json={"targetGroupId": None, "position": 0},
    )
    assert (
        client.post("/api/v1/tabs/missing/tags", headers=headers, json={"tagName": "x"}).status_code
        == 404
    )
    client.post(f"/api/v1/tabs/{first['id']}/tags", headers=headers, json={"tagName": "merged"})
    restored_new = {
        "id": "restored-new",
        "url": "https://example.com/restored",
        "title": "Restored",
        "tags": [],
        "updatedAt": "2030-01-01T00:00:00Z",
    }
    assert (
        client.post("/api/v1/tabs/restore", headers=headers, json=[restored_new]).json()["data"][
            "restored"
        ]
        == 1
    )
    restored_new["title"] = "Newer"
    restored_new["updatedAt"] = "2031-01-01T00:00:00Z"
    assert (
        client.post("/api/v1/tabs/restore", headers=headers, json=[restored_new]).json()["data"][
            "restored"
        ]
        == 1
    )
