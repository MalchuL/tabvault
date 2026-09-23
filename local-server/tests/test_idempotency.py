"""Focused idempotency request-identity tests."""

import uuid

from fastapi.testclient import TestClient


def test_query_string_participates_in_request_identity(
    client: TestClient, headers: dict[str, str]
) -> None:
    key_headers = {**headers, "Idempotency-Key": str(uuid.uuid4())}
    body = {"url": "https://example.com/idempotency-query"}

    first = client.post("/api/v1/tabs?source=one", headers=key_headers, json=body)
    replay = client.post("/api/v1/tabs?source=one", headers=key_headers, json=body)
    conflict = client.post("/api/v1/tabs?source=two", headers=key_headers, json=body)

    assert first.status_code == replay.status_code == 201
    assert replay.json() == first.json()
    assert conflict.status_code == 409
    assert conflict.json()["errors"][0]["code"] == "E_IDEMPOTENCY_CONFLICT"
