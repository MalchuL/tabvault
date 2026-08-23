"""MCP tools that proxy the local TabVault HTTP API."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
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


def _data(response: dict[str, Any]) -> dict[str, Any]:
    """Read one object from the standard API envelope."""
    value = response.get("data")
    return value if isinstance(value, dict) else {}


def _is_hidden(tab: dict[str, Any]) -> bool:
    """Return whether an active tab is under a future visibility embargo."""
    raw = tab.get("hiddenUntil")
    if not isinstance(raw, str) or not raw:
        return False
    deadline = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)
    return deadline > datetime.now(UTC)


def _visible_tab(client: TabVaultApi, tab_id: str) -> dict[str, Any]:
    """Load one tab only when MCP is allowed to access it."""
    response = client.request("GET", f"/tabs/{tab_id}")
    tab = _data(response)
    if tab.get("archived") is True or _is_hidden(tab):
        raise TabVaultApiError("Saved Tab is not accessible through MCP")
    return response


def _visible_group(client: TabVaultApi, group_id: str) -> None:
    """Require a Group to appear in the ordinary visible collection."""
    response = client.request("GET", "/groups", query={"visibility": "visible"})
    groups = _data(response).get("groups", [])
    if not any(isinstance(group, dict) and group.get("id") == group_id for group in groups):
        raise TabVaultApiError("Group is not accessible through MCP")


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
    category: str | None = None,
    tags: str = "",
    search: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    fields: str = "full",
) -> dict[str, Any]:
    """List active visible tabs, including Unassigned or one Group category."""
    return api().request(
        "GET",
        "/tabs",
        query={
            "groupId": groupId,
            "category": category,
            "tags": tags,
            "search": search,
            "limit": limit,
            "cursor": cursor,
            "fields": fields,
            "visibility": "visible",
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
    """Read one active visible saved tab."""
    client = api()
    return _visible_tab(client, id)


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
    """Save exactly one active occurrence with optional metadata."""
    client = api()
    if groupId is not None:
        _visible_group(client, groupId)
    return client.request(
        "POST",
        "/tabs",
        {
            "url": url,
            "title": title,
            "note": note,
            "agentReview": agentReview,
            "viewed": viewed,
            "tags": tags or [],
            "groupId": groupId,
        },
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def update_tab(
    id: str,
    url: str | None = None,
    title: str | None = None,
    note: str | None = None,
    agentReview: str | None = None,
    viewed: bool | None = None,
    tags: list[str] | None = None,
    position: float | None = None,
    hiddenUntil: str | None = None,
) -> dict[str, Any]:
    """Update supplied fields on one active visible tab."""
    client = api()
    _visible_tab(client, id)
    values = {
        "url": url,
        "title": title,
        "note": note,
        "agentReview": agentReview,
        "viewed": viewed,
        "tags": tags,
        "position": position,
        "hiddenUntil": hiddenUntil,
    }
    return client.request(
        "PATCH", f"/tabs/{id}", {key: value for key, value in values.items() if value is not None}
    )


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
def delete_tab(id: str) -> dict[str, Any]:
    """Archive and Unassign one active visible tab."""
    client = api()
    _visible_tab(client, id)
    return client.request("DELETE", f"/tabs/{id}")


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def move_tab(
    id: str, targetGroupId: str | None = None, position: int | None = None
) -> dict[str, Any]:
    """PATCH one active visible tab into a Group or Unassigned."""
    client = api()
    _visible_tab(client, id)
    if targetGroupId is not None:
        _visible_group(client, targetGroupId)
    body: dict[str, Any] = {"groupId": targetGroupId}
    if position is not None:
        body["position"] = position
    return client.request("PATCH", f"/tabs/{id}", body)


@mcp.tool(annotations=READ, structured_output=True)
def list_groups(category: str | None = None) -> dict[str, Any]:
    """List visible flat Groups, optionally restricted by category."""
    return api().request("GET", "/groups", query={"visibility": "visible", "category": category})


@mcp.tool(annotations=WRITE, structured_output=True)
def create_group(
    name: str,
    description: str = "",
    color: str | None = None,
) -> dict[str, Any]:
    """Create a Manual Group."""
    return api().request(
        "POST",
        "/groups",
        {"name": name, "description": description, "category": "manual", "color": color},
    )


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def update_group(
    id: str,
    name: str | None = None,
    description: str | None = None,
    color: str | None = None,
    position: float | None = None,
) -> dict[str, Any]:
    """Update a visible Group and explicitly reclassify it as manual."""
    client = api()
    _visible_group(client, id)
    values = {
        "name": name,
        "description": description,
        "color": color,
        "position": position,
        "category": "manual",
    }
    return client.request(
        "PATCH", f"/groups/{id}", {key: value for key, value in values.items() if value is not None}
    )


@mcp.tool(annotations=DESTRUCTIVE, structured_output=True)
def delete_group(id: str) -> dict[str, Any]:
    """Delete a visible Group when it contains no hidden members."""
    client = api()
    _visible_group(client, id)
    hidden = client.request(
        "GET",
        f"/groups/{id}/tabs",
        query={"visibility": "hidden", "fields": "minimal", "limit": 1},
    )
    if _data(hidden).get("tabs"):
        raise TabVaultApiError("Group is not accessible through MCP")
    return client.request("DELETE", f"/groups/{id}")


@mcp.tool(annotations=READ, structured_output=True)
def list_tags() -> dict[str, Any]:
    """List known tags and their descriptions."""
    return api().request("GET", "/tags")


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def tag_tab(tabId: str, tagName: str) -> dict[str, Any]:
    """Attach one tag to one tab."""
    client = api()
    _visible_tab(client, tabId)
    return client.request("POST", f"/tabs/{tabId}/tags", {"tagName": tagName})


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def untag_tab(tabId: str, tagName: str) -> dict[str, Any]:
    """Detach one tag from one tab."""
    client = api()
    _visible_tab(client, tabId)
    return client.request("DELETE", f"/tabs/{tabId}/tags/{tagName}")


def main() -> None:
    """Run the MCP server over its configured transport."""
    mcp.run()


if __name__ == "__main__":
    main()
