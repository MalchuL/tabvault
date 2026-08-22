"""MCP tools that proxy the local TabVault HTTP API."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

DEFAULT_SERVER_URL = "http://127.0.0.1:47821"


class TabVaultApiError(RuntimeError):
    """Indicate an unavailable or unsuccessful local API request."""


@dataclass(frozen=True)
class TabVaultApi:
    """Small standard-library client for the local TabVault API."""

    base_url: str
    api_key: str | None

    @classmethod
    def from_environment(cls) -> TabVaultApi:
        """Build a client from server URL and API key environment values."""
        return cls(
            os.environ.get("TABVAULT_SERVER_URL", DEFAULT_SERVER_URL).rstrip("/"),
            os.environ.get("TABVAULT_API_KEY") or None,
        )

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        query: dict[str, Any] | None = None,
        content_type: str = "application/json",
    ) -> dict[str, Any]:
        """Send one request and return its structured JSON response."""
        query_values = {key: value for key, value in (query or {}).items() if value is not None}
        url = f"{self.base_url}/api/v1{path}"
        if query_values:
            url += "?" + urlencode(query_values)
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        data: bytes | None = None
        if body is not None:
            headers["Content-Type"] = content_type
            data = (
                json.dumps(body).encode()
                if content_type == "application/json"
                else str(body).encode()
            )
        try:
            with urlopen(
                Request(url, data=data, headers=headers, method=method), timeout=30
            ) as response:
                raw = response.read()
                if response.headers.get_content_type() == "application/json":
                    return cast(dict[str, Any], json.loads(raw))
                return {
                    "success": True,
                    "data": {
                        "content": raw.decode(),
                        "contentType": response.headers.get_content_type(),
                    },
                }
        except HTTPError as error:
            raw = error.read().decode(errors="replace")
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                message = raw
            raise TabVaultApiError(f"TabVault API returned {error.code}: {message}") from error
        except (URLError, TimeoutError, OSError) as error:
            raise TabVaultApiError(f"TabVault API is unavailable: {error}") from error


def api() -> TabVaultApi:
    """Build the current environment-backed API client."""
    return TabVaultApi.from_environment()


READ = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)
WRITE = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False
)
IDEMPOTENT_WRITE = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)
DESTRUCTIVE = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=False, open_world_hint=False
)
mcp = MCPServer("TabVault")


@mcp.tool(annotations=READ, structured_output=True)
def list_tabs(
    groupId: str = "all",
    tags: str = "",
    search: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    fields: str = "full",
) -> dict[str, Any]:
    """List saved tabs with cursor pagination."""
    return api().request(
        "GET",
        "/tabs",
        query={
            "groupId": groupId,
            "tags": tags,
            "search": search,
            "limit": limit,
            "cursor": cursor,
            "fields": fields,
        },
    )


@mcp.tool(annotations=READ, structured_output=True)
def search_tabs(
    query: str,
    mode: Literal["semantic", "keyword", "hybrid"] = "hybrid",
    limit: int = 10,
    groupId: str | None = None,
) -> dict[str, Any]:
    """Search saved tabs by meaning and text."""
    return api().request(
        "GET", "/search", query={"q": query, "mode": mode, "limit": limit, "groupId": groupId}
    )


@mcp.tool(annotations=READ, structured_output=True)
def get_tab(id: str) -> dict[str, Any]:
    """Read one saved tab."""
    return api().request("GET", f"/tabs/{id}")


@mcp.tool(annotations=WRITE, structured_output=True)
def save_tab(
    url: str,
    title: str | None = None,
    note: str = "",
    agentReview: str = "",
    viewed: bool = False,
    tags: list[str] | None = None,
    groupId: str | None = None,
) -> dict[str, Any]:
    """Save one URL with optional metadata."""
    return api().request(
        "POST",
        "/tabs",
        {
            "tabs": [
                {
                    "url": url,
                    "title": title,
                    "note": note,
                    "agentReview": agentReview,
                    "viewed": viewed,
                    "tags": tags or [],
                    "groupId": groupId,
                }
            ]
        },
    )


@mcp.tool(annotations=WRITE, structured_output=True)
def save_tabs_batch(
    tabs: list[dict[str, Any]],
    dedupeStrategy: Literal["skip", "merge", "createAnyway"] = "skip",
    atomic: bool = False,
) -> dict[str, Any]:
    """Save a batch of URLs and return every validation result."""
    return api().request(
        "POST",
        "/tabs",
        {"tabs": tabs, "dedupeStrategy": dedupeStrategy},
        query={"atomic": str(atomic).lower()},
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def update_tab(
    id: str,
    title: str | None = None,
    note: str | None = None,
    agentReview: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    groupId: str | None = None,
) -> dict[str, Any]:
    """Update supplied fields on one tab."""
    values = {
        "title": title,
        "note": note,
        "agentReview": agentReview,
        "viewed": viewed,
        "tags": tags,
        "groupId": groupId,
    }
    return api().request(
        "PATCH", f"/tabs/{id}", {key: value for key, value in values.items() if value is not None}
    )


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
def delete_tab(id: str, hard: bool = False) -> dict[str, Any]:
    """Archive a tab, or permanently delete an already archived tab."""
    return api().request("DELETE", f"/tabs/{id}", query={"hard": str(hard).lower()})


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def move_tab(
    id: str, targetGroupId: str | None = None, position: int | None = None
) -> dict[str, Any]:
    """Move one tab to a group or Inbox."""
    return api().request(
        "POST", f"/tabs/{id}/move", {"targetGroupId": targetGroupId, "position": position}
    )


@mcp.tool(annotations=READ, structured_output=True)
def list_groups(flat: bool = True) -> dict[str, Any]:
    """List the complete group structure, including empty groups."""
    return api().request("GET", "/groups", query={"flat": str(flat).lower()})


@mcp.tool(annotations=WRITE, structured_output=True)
def create_group(
    name: str,
    description: str = "",
    parentId: str | None = None,
    color: str | None = None,
) -> dict[str, Any]:
    """Create a group."""
    return api().request(
        "POST",
        "/groups",
        {"name": name, "description": description, "parentId": parentId, "color": color},
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def update_group(
    id: str,
    name: str | None = None,
    description: str | None = None,
    parentId: str | None = None,
    color: str | None = None,
    position: float | None = None,
) -> dict[str, Any]:
    """Update supplied fields on a group."""
    values = {
        "name": name,
        "description": description,
        "parentId": parentId,
        "color": color,
        "position": position,
    }
    return api().request(
        "PATCH", f"/groups/{id}", {key: value for key, value in values.items() if value is not None}
    )


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
def delete_group(
    id: str, strategy: Literal["cascade", "promote", "reject_if_nonempty"]
) -> dict[str, Any]:
    """Delete a group using an explicit child/tab strategy."""
    return api().request("DELETE", f"/groups/{id}", query={"strategy": strategy})


@mcp.tool(annotations=READ, structured_output=True)
def list_tags() -> dict[str, Any]:
    """List known tags and their descriptions."""
    return api().request("GET", "/tags")


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def tag_tab(tabId: str, tagName: str) -> dict[str, Any]:
    """Attach one tag to one tab."""
    return api().request("POST", f"/tabs/{tabId}/tags", {"tagName": tagName})


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def untag_tab(tabId: str, tagName: str) -> dict[str, Any]:
    """Detach one tag from one tab."""
    return api().request("DELETE", f"/tabs/{tabId}/tags/{tagName}")


@mcp.tool(annotations=READ, structured_output=True)
def export_data(
    format: Literal["json", "markdown"],
    scope: str = "all",
    fields: Literal["full", "minimal"] = "full",
) -> dict[str, Any]:
    """Export the library in a machine or human-readable format."""
    return api().request(
        "GET", "/export", query={"format": format, "scope": scope, "fields": fields}
    )


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
def import_data(
    mode: Literal["upload", "replace"], format: Literal["json", "markdown"], content: Any
) -> dict[str, Any]:
    """Upload or replace library data after validation."""
    return api().request(
        "POST",
        "/import",
        content,
        query={"mode": mode},
        content_type="application/json" if format == "json" else "text/markdown",
    )


@mcp.tool(annotations=READ, structured_output=True)
def validate_import(format: Literal["json", "markdown"], content: Any) -> dict[str, Any]:
    """Validate an import without changing the library."""
    return api().request(
        "POST",
        "/import/validate",
        content,
        content_type="application/json" if format == "json" else "text/markdown",
    )


def main() -> None:
    """Run the MCP server over its configured transport."""
    mcp.run()


if __name__ == "__main__":
    main()
