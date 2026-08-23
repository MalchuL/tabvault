from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient


def create_group(
    client: TestClient,
    headers: dict[str, str],
    name: str = "Research",
    category: str = "manual",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/groups", headers=headers, json={"name": name, "category": category}
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def create_tab(
    client: TestClient,
    headers: dict[str, str],
    url: str = "https://example.com/article",
    group_id: str | None = None,
    **values: object,
) -> dict[str, object]:
    body: dict[str, object] = {"url": url, "title": "Example", "groupId": group_id}
    body.update(values)
    response = client.post("/api/v1/tabs", headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_auth_prefix_health_and_required_group_category(
    client: TestClient, headers: dict[str, str]
) -> None:
    assert client.get("/api/v1/health").status_code == 401
    assert client.get("/v1/tabs", headers=headers).status_code == 404
    health = client.get("/api/v1/health", headers=headers)
    assert health.status_code == 200
    assert health.json()["schemaVersion"] == 2

    invalid = client.post("/api/v1/groups", headers=headers, json={"name": "Missing"})
    assert invalid.status_code == 422
    assert invalid.json()["success"] is False
    assert invalid.json()["errors"][0]["path"] == "body.category"


def test_flat_open_category_groups_and_unassigned_tabs(
    client: TestClient, headers: dict[str, str]
) -> None:
    session = create_group(client, headers, "Session Aug 23 12:30", "session")
    custom = create_group(client, headers, "Custom", "anything")
    tab = create_tab(client, headers)
    session_tab = create_tab(client, headers, "https://example.com/session", str(session["id"]))
    assert tab["groupId"] is None

    groups = client.get("/api/v1/groups", headers=headers).json()["data"]["groups"]
    assert {group["category"] for group in groups} == {"session", "anything"}
    assert all("parentId" not in group and "archived" not in group for group in groups)
    assert {group["id"] for group in groups} == {session["id"], custom["id"]}
    assert [
        group["id"]
        for group in client.get("/api/v1/groups?category=session", headers=headers).json()["data"][
            "groups"
        ]
    ] == [session["id"]]
    assert [
        item["id"]
        for item in client.get("/api/v1/tabs?category=session", headers=headers).json()["data"][
            "tabs"
        ]
    ] == [session_tab["id"]]
    assert (
        client.post(
            "/api/v1/groups",
            headers=headers,
            json={"name": "Nested", "category": "manual", "parentId": session["id"]},
        ).status_code
        == 422
    )


def test_each_create_is_a_distinct_occurrence_and_url_is_exact(
    client: TestClient, headers: dict[str, str]
) -> None:
    url = "HTTPS://Example.COM/path?query=One#Anchor"
    first = create_tab(client, headers, url)
    second = create_tab(client, headers, url)
    assert first["id"] != second["id"]
    assert first["url"] == second["url"] == url
    listed = client.get("/api/v1/tabs", headers=headers).json()["data"]["tabs"]
    assert len([tab for tab in listed if tab["url"] == url]) == 2


def test_tab_create_idempotency_is_memory_scoped_to_post_tabs(
    client: TestClient, headers: dict[str, str]
) -> None:
    key = str(uuid.uuid4())
    request_headers = {**headers, "Idempotency-Key": key}
    body = {"url": "https://example.com/idempotent", "title": "One"}
    first = client.post("/api/v1/tabs", headers=request_headers, json=body)
    replay = client.post("/api/v1/tabs", headers=request_headers, json=body)
    conflict = client.post(
        "/api/v1/tabs",
        headers=request_headers,
        json={"url": "https://example.com/different"},
    )
    assert first.status_code == replay.status_code == 201
    assert replay.json() == first.json()
    assert conflict.status_code == 409
    assert conflict.json()["errors"][0]["code"] == "E_IDEMPOTENCY_CONFLICT"

    group_body = {"name": "Not cached", "category": "manual"}
    first_group = client.post("/api/v1/groups", headers=request_headers, json=group_body)
    second_group = client.post("/api/v1/groups", headers=request_headers, json=group_body)
    assert first_group.json()["data"]["id"] != second_group.json()["data"]["id"]


def test_concurrent_matching_idempotent_creates_coalesce(
    client: TestClient, headers: dict[str, str]
) -> None:
    key = str(uuid.uuid4())
    request_headers = {**headers, "Idempotency-Key": key}
    body = {"url": "https://example.com/concurrent", "title": "Concurrent"}
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(
            pool.map(
                lambda _: client.post("/api/v1/tabs", headers=request_headers, json=body),
                range(6),
            )
        )
    assert {response.status_code for response in responses} == {201}
    assert len({response.json()["data"]["id"] for response in responses}) == 1


def test_patch_is_the_only_move_restore_and_metadata_update(
    client: TestClient, headers: dict[str, str]
) -> None:
    group = create_group(client, headers)
    tab = create_tab(client, headers)
    changed = client.patch(
        f"/api/v1/tabs/{tab['id']}",
        headers=headers,
        json={
            "groupId": group["id"],
            "note": "Human note",
            "agentReview": "Agent note",
            "viewed": True,
            "hiddenUntil": "2030-01-01T00:00:00Z",
        },
    ).json()["data"]
    assert changed["groupId"] == group["id"]
    assert changed["note"] == "Human note"
    assert changed["agentReview"] == "Agent note"
    assert changed["viewed"] is True
    assert changed["hiddenUntil"].startswith("2030-01-01")

    archived = client.patch(
        f"/api/v1/tabs/{tab['id']}", headers=headers, json={"archived": True}
    ).json()["data"]
    assert archived["archived"] is True
    assert archived["groupId"] is None
    blocked = client.patch(
        f"/api/v1/tabs/{tab['id']}", headers=headers, json={"groupId": group["id"]}
    )
    assert blocked.status_code == 409
    restored = client.patch(
        f"/api/v1/tabs/{tab['id']}", headers=headers, json={"archived": False}
    ).json()["data"]
    assert restored["archived"] is False and restored["groupId"] is None

    assert client.post("/api/v1/tabs/restore", headers=headers, json=[]).status_code == 405
    assert client.post(
        f"/api/v1/tabs/{tab['id']}/move",
        headers=headers,
        json={"targetGroupId": group["id"]},
    ).status_code in {404, 405}


def test_deleting_group_archives_and_unassigns_members_atomically(
    client: TestClient, headers: dict[str, str]
) -> None:
    group = create_group(client, headers)
    member = create_tab(client, headers, group_id=str(group["id"]))
    deleted = client.delete(f"/api/v1/groups/{group['id']}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["data"]["archivedTabCount"] == 1
    assert client.get(f"/api/v1/groups/{group['id']}", headers=headers).status_code == 404
    saved = client.get(f"/api/v1/tabs/{member['id']}", headers=headers).json()["data"]
    assert saved["archived"] is True and saved["groupId"] is None


def test_archiving_last_member_does_not_delete_empty_group(
    client: TestClient, headers: dict[str, str]
) -> None:
    group = create_group(client, headers, category="session")
    tab = create_tab(client, headers, group_id=str(group["id"]))
    client.delete(f"/api/v1/tabs/{tab['id']}", headers=headers)
    loaded = client.get(f"/api/v1/groups/{group['id']}", headers=headers)
    assert loaded.status_code == 200
    assert loaded.json()["data"]["tabCount"] == 0


def test_tags_archive_and_hard_delete(client: TestClient, headers: dict[str, str]) -> None:
    tab = create_tab(client, headers)
    tagged = client.post(
        f"/api/v1/tabs/{tab['id']}/tags", headers=headers, json={"tagName": "Python"}
    )
    assert tagged.json()["data"]["tags"] == ["Python"]
    assert client.delete(f"/api/v1/tabs/{tab['id']}?hard=true", headers=headers).status_code == 409
    assert client.delete(f"/api/v1/tabs/{tab['id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/tabs/{tab['id']}?hard=true", headers=headers).status_code == 200
    assert client.get(f"/api/v1/tabs/{tab['id']}", headers=headers).status_code == 404


def test_cursor_projection_and_single_resource_contract(
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
    assert {item["id"] for item in first["data"]["tabs"]}.isdisjoint(
        item["id"] for item in second["data"]["tabs"]
    )
    assert (
        client.post(
            "/api/v1/tabs", headers=headers, json={"tabs": [{"url": "https://example.com"}]}
        ).status_code
        == 422
    )
    assert client.post("/api/v1/tabs/batch-delete", headers=headers, json={}).status_code == 405


def test_tab_filters_errors_and_group_scoped_listing(
    client: TestClient, headers: dict[str, str]
) -> None:
    group = create_group(client, headers)
    first = create_tab(client, headers, "https://example.com/one", str(group["id"]))
    second = create_tab(client, headers, "https://example.com/two")
    assert client.patch(f"/api/v1/tabs/{first['id']}", headers=headers, json={}).status_code == 422
    assert (
        client.patch("/api/v1/tabs/missing", headers=headers, json={"title": "X"}).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/tabs/{first['id']}", headers=headers, json={"groupId": "missing"}
        ).status_code
        == 409
    )
    updated = client.patch(
        f"/api/v1/tabs/{first['id']}",
        headers=headers,
        json={"title": "Changed", "note": None, "tags": ["alpha", "beta"]},
    ).json()["data"]
    assert updated["note"] == ""
    filtered = client.get(
        "/api/v1/tabs?tags=beta&tagsAll=beta&search=changed&sortBy=title&sortDir=desc",
        headers=headers,
    ).json()["data"]["tabs"]
    assert [item["id"] for item in filtered] == [first["id"]]
    scoped = client.get(f"/api/v1/groups/{group['id']}/tabs", headers=headers).json()
    assert [item["id"] for item in scoped["data"]["tabs"]] == [first["id"]]
    assert client.get("/api/v1/groups/missing/tabs", headers=headers).status_code == 404
    assert client.get("/api/v1/tabs?cursor=broken", headers=headers).status_code == 422
    assert client.delete("/api/v1/tabs/missing", headers=headers).status_code == 404
    assert (
        client.post(
            f"/api/v1/tabs/{second['id']}/tags", headers=headers, json={"tagName": "alpha"}
        ).status_code
        == 200
    )


def test_group_update_and_missing_resource_errors(
    client: TestClient, headers: dict[str, str]
) -> None:
    group = create_group(client, headers, category="session")
    updated = client.patch(
        f"/api/v1/groups/{group['id']}",
        headers=headers,
        json={"name": "Renamed", "description": "Filing context", "category": "manual"},
    ).json()["data"]
    assert updated["name"] == "Renamed"
    assert updated["description"] == "Filing context"
    assert updated["category"] == "manual"
    assert (
        client.patch(f"/api/v1/groups/{group['id']}", headers=headers, json={}).status_code == 422
    )
    assert (
        client.patch("/api/v1/groups/missing", headers=headers, json={"name": "X"}).status_code
        == 404
    )
    assert client.delete("/api/v1/groups/missing", headers=headers).status_code == 404


def test_tag_catalog_markdown_detach_delete_and_missing(
    client: TestClient, headers: dict[str, str]
) -> None:
    tab = create_tab(client, headers)
    client.post(f"/api/v1/tabs/{tab['id']}/tags", headers=headers, json={"tagName": "Docs"})
    updated = client.put(
        "/api/v1/tags/docs", headers=headers, json={"description": "Documentation"}
    )
    assert updated.json()["data"]["name"] == "Docs"
    listing = client.get("/api/v1/tags", headers=headers).json()["data"]["tags"]
    assert listing[0]["tabCount"] == 1
    assert "Docs" in client.get("/api/v1/tags/export.md", headers=headers).text
    assert client.delete("/api/v1/tags/docs", headers=headers).status_code == 409
    detached = client.delete("/api/v1/tags/docs?detachFromTabs=true", headers=headers)
    assert detached.status_code == 200
    assert client.delete("/api/v1/tags/docs", headers=headers).status_code == 404
    assert (
        client.delete(f"/api/v1/tabs/{tab['id']}/tags/missing", headers=headers).status_code == 200
    )
    assert (
        client.post("/api/v1/tabs/missing/tags", headers=headers, json={"tagName": "x"}).status_code
        == 404
    )


def test_search_jobs_preview_fallback_and_meta_routes(
    client: TestClient, headers: dict[str, str]
) -> None:
    tab = create_tab(client, headers, "https://example.com/python")
    client.patch(
        f"/api/v1/tabs/{tab['id']}",
        headers=headers,
        json={"note": "async python guide", "agentReview": "quantum filing summary"},
    )
    keyword = client.get("/api/v1/search?q=python&mode=keyword", headers=headers).json()
    assert keyword["data"]["results"][0]["matchType"] == "keyword"
    agent = client.get("/api/v1/search?q=quantum&mode=keyword", headers=headers).json()
    assert agent["data"]["results"][0]["matchedOn"] == "agentReview"
    hybrid = client.get("/api/v1/search?q=example&mode=hybrid", headers=headers).json()
    assert hybrid["warnings"][0]["code"] == "W_SEMANTIC_UNAVAILABLE"
    assert client.get("/api/v1/search?q=example&mode=semantic", headers=headers).status_code == 503
    queued = client.post("/api/v1/search/reindex", headers=headers)
    assert queued.status_code == 202
    job_id = queued.json()["data"]["jobId"]
    assert (
        client.get(f"/api/v1/jobs/{job_id}", headers=headers).json()["data"]["status"] == "pending"
    )
    assert client.get("/api/v1/jobs/missing", headers=headers).status_code == 404
    assert (
        client.get(f"/api/v1/tabs/{tab['id']}/preview", headers=headers).json()["data"]["status"]
        == "pending"
    )
    assert (
        client.post(f"/api/v1/tabs/{tab['id']}/preview/refresh", headers=headers).status_code == 202
    )
    assert client.get("/api/v1/tabs/missing/preview", headers=headers).status_code == 404
    assert client.post("/api/v1/tabs/missing/preview/refresh", headers=headers).status_code == 404
    fallback = client.get("/api/v1/assets/missing", headers=headers)
    assert fallback.status_code == 200
    assert fallback.headers["content-type"].startswith("image/svg+xml")
    assert client.get("/api/v1/schema", headers=headers).json()["properties"]["schemaVersion"]
    assert client.get("/api/v1/errors", headers=headers).status_code == 200


def test_health_schedule_status_and_missing_backup(
    client: TestClient, headers: dict[str, str]
) -> None:
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
    assert client.post("/api/v1/backups/missing/restore", headers=headers).status_code == 404


def test_markdown_import_scoped_export_replace_and_restore_job(
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
    assert exported["schemaVersion"] == 2 and len(exported["tabs"]) == 1
    document = client.get("/api/v1/export?format=json", headers=headers).json()
    replaced = client.post(
        "/api/v1/import",
        headers=headers,
        json={"mode": "replace", "format": "json", "content": document},
    )
    assert replaced.status_code == 200
    backup_id = replaced.json()["data"]["backupSnapshotId"]
    assert client.post(f"/api/v1/backups/{backup_id}/restore", headers=headers).status_code == 202
    assert client.post("/api/v1/import", headers=headers, json=document).status_code == 422


def test_visibility_policy_is_shared_by_lists_groups_search_counts_and_export(
    client: TestClient, headers: dict[str, str]
) -> None:
    hidden_group = create_group(client, headers, "Hidden only")
    mixed_group = create_group(client, headers, "Mixed")
    empty_group = create_group(client, headers, "Empty")
    visible = create_tab(
        client,
        headers,
        "https://example.com/visible-keyword",
        str(mixed_group["id"]),
        tags=["visibility"],
    )
    hidden_mixed = create_tab(
        client,
        headers,
        "https://example.com/hidden-mixed-keyword",
        str(mixed_group["id"]),
        tags=["visibility"],
    )
    hidden_only = create_tab(
        client,
        headers,
        "https://example.com/hidden-only-keyword",
        str(hidden_group["id"]),
        tags=["visibility"],
    )
    elapsed = create_tab(
        client,
        headers,
        "https://example.com/elapsed-keyword",
        tags=["visibility"],
    )
    archived = create_tab(
        client,
        headers,
        "https://example.com/archived-keyword",
        tags=["visibility"],
    )
    future = "2999-01-01T00:00:00+03:00"
    for tab in (hidden_mixed, hidden_only, archived):
        response = client.patch(
            f"/api/v1/tabs/{tab['id']}", headers=headers, json={"hiddenUntil": future}
        )
        assert response.status_code == 200
        assert response.json()["data"]["hiddenUntil"].endswith("Z")
    client.patch(
        f"/api/v1/tabs/{elapsed['id']}",
        headers=headers,
        json={"hiddenUntil": "2020-01-01T00:00:00Z"},
    )
    client.patch(f"/api/v1/tabs/{archived['id']}", headers=headers, json={"archived": True})

    visible_ids = {
        tab["id"] for tab in client.get("/api/v1/tabs", headers=headers).json()["data"]["tabs"]
    }
    hidden_ids = {
        tab["id"]
        for tab in client.get("/api/v1/tabs?visibility=hidden", headers=headers).json()["data"][
            "tabs"
        ]
    }
    archived_ids = {
        tab["id"]
        for tab in client.get("/api/v1/tabs?visibility=archived", headers=headers).json()["data"][
            "tabs"
        ]
    }
    assert {visible["id"], elapsed["id"]} <= visible_ids
    assert {hidden_mixed["id"], hidden_only["id"]} == hidden_ids
    assert archived["id"] in archived_ids and archived["id"] not in hidden_ids

    visible_groups = {
        group["id"]
        for group in client.get("/api/v1/groups", headers=headers).json()["data"]["groups"]
    }
    hidden_groups = {
        group["id"]
        for group in client.get("/api/v1/groups?visibility=hidden", headers=headers).json()["data"][
            "groups"
        ]
    }
    assert mixed_group["id"] in visible_groups
    assert empty_group["id"] in visible_groups
    assert hidden_group["id"] not in visible_groups
    assert {mixed_group["id"], hidden_group["id"]} <= hidden_groups
    assert (
        client.get(
            f"/api/v1/groups/{mixed_group['id']}/tabs?visibility=hidden", headers=headers
        ).json()["data"]["tabs"][0]["id"]
        == hidden_mixed["id"]
    )
    assert (
        client.get("/api/v1/groups?visibility=archived", headers=headers).json()["data"]["groups"]
        == []
    )

    search = client.get("/api/v1/search?q=keyword&mode=keyword", headers=headers).json()
    assert {item["tab"]["id"] for item in search["data"]["results"]} == {
        visible["id"],
        elapsed["id"],
    }
    tags = client.get("/api/v1/tags", headers=headers).json()["data"]["tags"]
    assert next(tag for tag in tags if tag["name"] == "visibility")["tabCount"] == 2
    assert client.get("/api/v1/health", headers=headers).json()["storage"]["tabs"] == 2

    exported = client.get("/api/v1/export?format=json", headers=headers).json()["tabs"]
    exported_ids = {tab["id"] for tab in exported}
    assert {visible["id"], elapsed["id"], archived["id"]} <= exported_ids
    assert {hidden_mixed["id"], hidden_only["id"]}.isdisjoint(exported_ids)
    synced = client.get("/api/v1/sync", headers=headers).json()
    synced_ids = {tab["id"] for tab in synced["tabs"]}
    assert synced["schemaVersion"] == 2
    assert {
        visible["id"],
        elapsed["id"],
        archived["id"],
        hidden_mixed["id"],
        hidden_only["id"],
    } <= synced_ids
    assert (
        client.patch(
            f"/api/v1/tabs/{visible['id']}",
            headers=headers,
            json={"hiddenUntil": "2030-01-01T00:00:00"},
        ).status_code
        == 422
    )
    assert client.get("/api/v1/tabs?visibility=invalid", headers=headers).status_code == 422
