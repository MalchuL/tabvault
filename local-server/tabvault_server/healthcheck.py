"""Optional local health polling for TabVault's derived semantic index."""

from __future__ import annotations

import json
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class IndexHealthScheduler:
    """A best-effort local scheduler that runs only while the user runs the TabVault server."""

    def __init__(self, directory: Path, status_reader: Callable[[], dict[str, Any]]) -> None:
        self.path = directory / "index-health-check.json"
        self.status_reader = status_reader
        self.interval_seconds = 0
        self.notify_on_needs_attention = False
        self.last_check: str | None = None
        self.last_result: str | None = None
        self.last_alert: str | None = None
        self._wake = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="tabvault-index-health")
        self._load()
        self._thread.start()

    def _load(self) -> None:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            self.interval_seconds = max(0, int(payload.get("intervalSeconds", 0)))
            self.notify_on_needs_attention = bool(payload.get("notifyOnNeedsAttention", False))
        except (OSError, ValueError, json.JSONDecodeError):
            self.interval_seconds = 0

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(
                {
                    "intervalSeconds": self.interval_seconds,
                    "notifyOnNeedsAttention": self.notify_on_needs_attention,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        temporary.replace(self.path)

    def check_now(self) -> dict[str, Any]:
        status = self.status_reader()
        self.last_check = now_iso()
        self.last_result = "ready" if status.get("status") == "ready" else "needs_attention"
        self.last_alert = (
            self.last_check
            if self.last_result == "needs_attention" and self.notify_on_needs_attention
            else None
        )
        return self.status()

    def configure(
        self, interval_seconds: int, notify_on_needs_attention: bool | None = None
    ) -> dict[str, Any]:
        self.interval_seconds = max(0, interval_seconds)
        if notify_on_needs_attention is not None:
            self.notify_on_needs_attention = notify_on_needs_attention
        self._save()
        self._wake.set()
        return self.status()

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.interval_seconds > 0,
            "intervalSeconds": self.interval_seconds,
            "notifyOnNeedsAttention": self.notify_on_needs_attention,
            "lastCheck": self.last_check,
            "lastResult": self.last_result,
            "lastAlert": self.last_alert,
        }

    def _run(self) -> None:
        while True:
            if self.interval_seconds <= 0:
                self._wake.wait()
                self._wake.clear()
                continue
            interrupted = self._wake.wait(self.interval_seconds)
            self._wake.clear()
            if not interrupted and self.interval_seconds > 0:
                self.check_now()
