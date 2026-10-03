"""Check debug gates, embedded credentials, and unsafe-mode warnings."""

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from api.routes.debug import DEBUG_WARNING
from config.settings import SettingsDebug, get_settings


@pytest.mark.parametrize("enabled,playground", [(False, True), (True, False), (False, False)])
def test_debug_page_requires_both_options(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, enabled: bool, playground: bool
) -> None:
    assert not SettingsDebug().enabled
    monkeypatch.setenv("TABVAULT_DEBUG__ENABLED", str(enabled))
    monkeypatch.setenv("TABVAULT_DEBUG__PLAYGROUND_ENABLED", str(playground))
    get_settings.cache_clear()
    response = client.get("/debug")
    assert response.status_code == 404
    assert "preauthorizeApiKey" not in response.text
    assert "test-key" not in response.text


def test_debug_page_escapes_and_prefills_key_without_caching_or_logging_it(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    key = '</script><script>alert("debug-key")</script>&\u2028'
    monkeypatch.setenv("TABVAULT_DEBUG__ENABLED", "true")
    monkeypatch.setenv("TABVAULT_DEBUG__PLAYGROUND_ENABLED", "true")
    monkeypatch.setenv("TABVAULT_HTTP__API_KEY", key)
    get_settings.cache_clear()
    caplog.clear()
    response = client.get("/debug")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert DEBUG_WARNING in response.text
    assert 'role="alert"' in response.text and "background:" in response.text
    assert '"tryItOutEnabled": true' in response.text
    assert '"persistAuthorization": false' in response.text
    embedded = response.text.split('ui.preauthorizeApiKey("API Key", ', 1)[1]
    assert json.JSONDecoder().raw_decode(embedded)[0] == key
    assert "</script><script>alert" not in response.text
    assert "debug-key" not in caplog.text and "preauthorizeApiKey" not in caplog.text
    assert "GET /debug -> 200" in caplog.text
    # The normal docs page never embeds credentials, even while debug mode is active.
    assert "preauthorizeApiKey" not in client.get("/docs").text


def test_debug_startup_warns_and_uses_configured_api_prefix(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("TABVAULT_STORAGE__DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TABVAULT_HTTP__API_KEY", "debug-test-key")
    monkeypatch.setenv("TABVAULT_HTTP__API_PREFIX", "/custom/api")
    monkeypatch.setenv("TABVAULT_DEBUG__ENABLED", "true")
    monkeypatch.setenv("TABVAULT_DEBUG__PLAYGROUND_ENABLED", "true")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            assert any(
                record.levelno == logging.WARNING and record.getMessage() == DEBUG_WARNING
                for record in caplog.records
            )
            assert "url: '/openapi.json'" in client.get("/debug").text
            schema = client.get("/openapi.json").json()
            assert "/custom/api/tabs" in schema["paths"]
            assert "/custom/api/groups" in schema["paths"]
            assert "/debug" not in schema["paths"]
            assert "debug-test-key" not in caplog.text
    finally:
        get_settings.cache_clear()
