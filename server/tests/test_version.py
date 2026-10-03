from importlib.metadata import version
from pathlib import Path


def test_backend_metadata_and_health_use_shared_version(client, headers) -> None:
    expected = (Path(__file__).parents[1] / "VERSION.txt").read_text().strip()
    assert version("tabvault-local-server") == expected
    assert client.app.version == expected
    assert client.get("/api/v1/health", headers=headers).json()["version"] == expected
