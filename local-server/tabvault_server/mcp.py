"""Official Python MCP SDK bridge for the TabVault FastAPI source of truth.

The MCP process owns no library state. Every tool forwards to the configured
FastAPI server using the same bearer contract as the browser extension.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from mcp.server import MCPServer

DEFAULT_SERVER_URL = "http://127.0.0.1:4817"
DEFAULT_API_KEY = "admin"


class TabVaultApiError(RuntimeError):
    """Machine-readable error returned by the configured TabVault HTTP server."""


@dataclass(frozen=True)
class TabVaultApi:
    base_url: str
    api_key: str

    @classmethod
    def from_environment(cls) -> TabVaultApi:
        return cls(
            base_url=os.environ.get("TABVAULT_SERVER_URL", DEFAULT_SERVER_URL).rstrip("/"),
            api_key=os.environ.get("TABVAULT_API_KEY", DEFAULT_API_KEY),
        )

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | list[dict[str, Any]] | None = None,
        query: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urlencode(query)}"
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            url,
            data=body,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                **({"Content-Type": "application/json"} if body is not None else {}),
            },
        )
        try:
            with urlopen(request, timeout=12) as response:  # noqa: S310
                decoded = response.read().decode("utf-8")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise TabVaultApiError(
                json.dumps(
                    {
                        "status": error.code,
                        "error": "tabvault_api_error",
                        "detail": _parse_json(detail),
                    }
                )
            ) from error
        except URLError as error:
            raise TabVaultApiError(
                json.dumps(
                    {
                        "status": 503,
                        "error": "tabvault_server_unavailable",
                        "detail": str(error.reason),
                    }
                )
            ) from error
        result = _parse_json(decoded)
        if not isinstance(result, dict):
            raise TabVaultApiError(
                json.dumps(
                    {
                        "status": 502,
                        "error": "invalid_tabvault_response",
                        "detail": result,
                    }
                )
            )
        return result


def _parse_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def api() -> TabVaultApi:
    return TabVaultApi.from_environment()


mcp = MCPServer("TabVault")


@mcp.tool()
def health() -> dict[str, Any]:
    """Check the authenticated TabVault FastAPI server and semantic-index state."""
    return api().request("GET", "/health")


@mcp.tool()
def list_tabs(
    group: str | None = None,
    tag: str | None = None,
    fields: Literal["minimal", "full"] = "full",
) -> dict[str, Any]:
    """List active saved tabs, optionally filtered by collection or tag."""
    query: dict[str, str] = {"fields": fields}
    if group is not None:
        query["group"] = group
    if tag is not None:
        query["tag"] = tag
    return api().request("GET", "/v1/tabs", query=query)


@mcp.tool()
def get_tab(id: str) -> dict[str, Any]:
    """Return the complete record for one saved tab."""
    return api().request("GET", f"/v1/tabs/{id}")


@mcp.tool()
def search_tabs(query: str, group: str | None = None) -> dict[str, Any]:
    """Search titles, notes, and tags with semantic search or its lexical fallback."""
    parameters = {"q": query}
    if group is not None:
        parameters["group"] = group
    return api().request("GET", "/v1/search", query=parameters)


@mcp.tool()
def semantic_index_status() -> dict[str, Any]:
    """Report the derived semantic index and health-check status."""
    return api().request("GET", "/v1/index/status")


@mcp.tool()
def rebuild_semantic_index() -> dict[str, Any]:
    """Queue a rebuild of the derived semantic index from authoritative tabs."""
    return api().request("POST", "/v1/index/rebuild")


@mcp.tool()
def save_tab(
    url: str,
    title: str,
    note: str | None = None,
    tags: list[str] | None = None,
    groupId: str | None = None,
    favicon: str | None = None,
) -> dict[str, Any]:
    """Save one URL; duplicate canonical URLs are deduplicated and archived records restore."""
    return api().request(
        "POST",
        "/v1/tabs",
        {
            "url": url,
            "title": title,
            "note": note,
            "tags": tags or [],
            "groupId": groupId,
            "favicon": favicon,
        },
    )


@mcp.tool()
def save_tabs(tabs: list[dict[str, Any]]) -> dict[str, Any]:
    """Save several tabs through the same validated FastAPI tab contract."""
    return {"results": [api().request("POST", "/v1/tabs", tab) for tab in tabs]}


@mcp.tool()
def update_tab(
    id: str,
    title: str | None = None,
    url: str | None = None,
    note: str | None = None,
    tags: list[str] | None = None,
    groupId: str | None = None,
    position: int | None = None,
    favicon: str | None = None,
) -> dict[str, Any]:
    """Update supplied tab fields, including title, notes, tags, collection, and position."""
    changes = {
        key: value
        for key, value in {
            "title": title,
            "url": url,
            "note": note,
            "tags": tags,
            "groupId": groupId,
            "position": position,
            "favicon": favicon,
        }.items()
        if value is not None
    }
    return api().request("PATCH", f"/v1/tabs/{id}", changes)


@mcp.tool()
def move_tab(id: str, groupId: str | None, position: int | None = None) -> dict[str, Any]:
    """Move a tab to Inbox or another collection and optionally set its list position."""
    payload: dict[str, Any] = {"groupId": groupId}
    if position is not None:
        payload["position"] = position
    return api().request("PATCH", f"/v1/tabs/{id}", payload)


@mcp.tool()
def archive_tab(id: str) -> dict[str, Any]:
    """Archive a tab while retaining it for later restore or permanent deletion."""
    return api().request("PATCH", f"/v1/tabs/{id}", {"archived": True})


@mcp.tool()
def delete_tab(id: str) -> dict[str, Any]:
    """Permanently delete an already archived tab."""
    return api().request("DELETE", f"/v1/tabs/{id}")


@mcp.tool()
def list_groups() -> dict[str, Any]:
    """List the complete nested collection tree."""
    return api().request("GET", "/v1/groups")


@mcp.tool()
def create_group(
    name: str, parentId: str | None = None, color: str | None = None
) -> dict[str, Any]:
    """Create a collection, optionally nested inside an existing parent."""
    return api().request("POST", "/v1/groups", {"name": name, "parentId": parentId, "color": color})


@mcp.tool()
def update_group(
    id: str,
    name: str | None = None,
    parentId: str | None = None,
    color: str | None = None,
    position: int | None = None,
) -> dict[str, Any]:
    """Rename, recolor, reparent, or reorder a collection."""
    changes = {
        key: value
        for key, value in {
            "name": name,
            "parentId": parentId,
            "color": color,
            "position": position,
        }.items()
        if value is not None
    }
    return api().request("PATCH", f"/v1/groups/{id}", changes)


@mcp.tool()
def delete_group(id: str) -> dict[str, Any]:
    """Delete a collection subtree and move its tabs to Inbox."""
    return api().request("DELETE", f"/v1/groups/{id}")


@mcp.tool()
def list_tags() -> dict[str, Any]:
    """List tags and their descriptions."""
    return api().request("GET", "/v1/tags")


@mcp.tool()
def add_tag(name: str, description: str | None = None) -> dict[str, Any]:
    """Add a tag to the authoritative tag directory."""
    return api().request("POST", "/v1/tags", {"name": name, "description": description})


@mcp.tool()
def remove_tag(name: str) -> dict[str, Any]:
    """Remove a tag from the directory and every linked tab."""
    return api().request("DELETE", f"/v1/tags/{name}")


@mcp.tool()
def export_data(
    format: Literal["json", "markdown"] = "json",
    group: str | None = None,
    tag: str | None = None,
) -> dict[str, Any]:
    """Export exact JSON or readable Markdown, optionally scoped by collection or tag."""
    query: dict[str, str] = {"format": format}
    if group is not None:
        query["group"] = group
    if tag is not None:
        query["tag"] = tag
    return api().request("GET", "/v1/export", query=query)


@mcp.tool()
def import_data(
    mode: Literal["upload", "replace"],
    format: Literal["json", "markdown"],
    content: Any,
) -> dict[str, Any]:
    """Validate then import JSON or Markdown, returning every detected import error."""
    return api().request("POST", "/v1/import", {"mode": mode, "format": format, "content": content})


@mcp.tool()
def schema_definition() -> dict[str, Any]:
    """Return the current machine-readable TabVault JSON Schema."""
    return api().request("GET", "/v1/schema")


@mcp.tool()
def error_catalog() -> dict[str, Any]:
    """Return machine-readable TabVault validation and import error codes."""
    return api().request("GET", "/v1/errors")


def main() -> None:
    """Run the official Python MCP SDK bridge over stdio."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
