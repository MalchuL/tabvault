"""Deterministic test-only Ollama-compatible embedding endpoint for TabVault semantic-index validation."""

from __future__ import annotations

import hashlib
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


def vector(text: str) -> list[float]:
    values = [0.0] * 16
    for token in text.lower().split():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for index, byte in enumerate(digest[:16]):
            values[index] += (byte / 127.5) - 1.0
    return values


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        if self.path not in {"/api/embed", "/api/embeddings"}:
            self.send_error(404)
            return
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        text = body.get("input") or body.get("prompt") or ""
        texts = text if isinstance(text, list) else [text]
        payload = (
            {"embeddings": [vector(str(item)) for item in texts]}
            if self.path == "/api/embed"
            else {"embedding": vector(str(texts[0]))}
        )
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_: object) -> None:
        return


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 11435), Handler).serve_forever()
