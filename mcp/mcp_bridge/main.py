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
    """Indicate an unavailable or unsuccessful local API request.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.
    """


@dataclass(frozen=True)
class TabVaultApi:
    """Small standard-library client for the local TabVault API.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Attributes:
        base_url (str): URL used for base.
        api_key (str | None): Typed api key value carried by this object.
    """

    base_url: str
    api_key: str | None

    @classmethod
    def from_environment(cls) -> TabVaultApi:
        """Build a client from server URL and API key environment values.

        This MCP-facing operation deliberately uses the public local HTTP API instead of database
        access, so agent actions observe the same visibility, validation, and transaction rules as
        other clients.

        Returns:
            TabVaultApi: Result produced by the operation described above.
        """
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
        """Send one request and return its structured JSON response.

        This MCP-facing operation deliberately uses the public local HTTP API instead of database
        access, so agent actions observe the same visibility, validation, and transaction rules as
        other clients.

        Args:
            method (str): Method value consumed by this operation.
            path (str): Filesystem path used by the operation.
            body (Any): Validated request body supplied by the caller.
            query (dict[str, Any] | None): Search text supplied by the caller.
            content_type (str): Content type value consumed by this operation.

        Returns:
            dict[str, Any]: Result produced by the operation described above.

        Raises:
            TabVaultApiError: Propagated when its documented validation or operation condition
                occurs.
        """
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
    """Build the current environment-backed API client.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Returns:
        TabVaultApi: Result produced by the operation described above.
    """
    return TabVaultApi.from_environment()


def _data(response: dict[str, Any]) -> dict[str, Any]:
    """Read one object from the standard API envelope.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        response (dict[str, Any]): Response value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    value = response.get("data")
    return value if isinstance(value, dict) else {}


def _page_data(response: dict[str, Any]) -> list[dict[str, Any]]:
    """Read object rows from a paginated API response."""
    value = response.get("data")
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _is_hidden(tab: dict[str, Any]) -> bool:
    """Return whether an active tab is under a future visibility embargo.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        tab (dict[str, Any]): Tab value consumed by this operation.

    Returns:
        bool: Result produced by the operation described above.
    """
    raw = tab.get("hiddenUntil")
    if not isinstance(raw, str) or not raw:
        return False
    deadline = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)
    return deadline > datetime.now(UTC)


def _visible_tab(client: TabVaultApi, tab_id: str) -> dict[str, Any]:
    """Load one tab only when MCP is allowed to access it.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        client (TabVaultApi): Client value consumed by this operation.
        tab_id (str): Stable identifier of the tab targeted by the operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.

    Raises:
        TabVaultApiError: Propagated when its documented validation or operation condition occurs.
    """
    response = client.request("GET", f"/tabs/{tab_id}")
    tab = _data(response)
    if tab.get("archived") is True or _is_hidden(tab):
        raise TabVaultApiError("Saved Tab is not accessible through MCP")
    return response


def _visible_group(client: TabVaultApi, group_id: str) -> None:
    """Require a Group to appear in the ordinary visible collection.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        client (TabVaultApi): Client value consumed by this operation.
        group_id (str): Stable identifier of the group targeted by the operation.

    Raises:
        TabVaultApiError: Propagated when its documented validation or operation condition occurs.
    """
    offset = 0
    while True:
        response = client.request(
            "GET",
            "/groups",
            query={"visibility": "visible", "limit": 100, "offset": offset},
        )
        groups = _page_data(response)
        if any(group.get("id") == group_id for group in groups):
            return
        if not response.get("hasNext"):
            raise TabVaultApiError("Group is not accessible through MCP")
        offset += len(groups)


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
    offset: int = 0,
    fields: str = "full",
) -> dict[str, Any]:
    """List active visible tabs, including Unassigned or one Group category.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        groupId (str): Groupid value consumed by this operation.
        category (str | None): Optional free-form Group category used to restrict results.
        tags (str): Tags value consumed by this operation.
        search (str | None): Search value consumed by this operation.
        limit (int): Maximum number of matching records to return.
        offset (int): Number of matching rows to skip before this page.
        fields (str): Requested response projection controlling which fields are serialized.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    return api().request(
        "GET",
        "/tabs",
        query={
            "groupId": groupId,
            "category": category,
            "tags": tags,
            "search": search,
            "limit": limit,
            "offset": offset,
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
    """Search saved tabs by meaning and text.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        query (str): Search text supplied by the caller.
        mode (Literal["semantic", "keyword", "hybrid"]): Requested import or update behavior.
        limit (int): Maximum number of matching records to return.
        groupId (str | None): Groupid value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    return api().request(
        "GET", "/search", query={"q": query, "mode": mode, "limit": limit, "groupId": groupId}
    )


@mcp.tool(annotations=READ, structured_output=True)
def get_tab(id: str) -> dict[str, Any]:
    """Read one active visible saved tab.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        id (str): Id value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
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
    """Save exactly one active occurrence with optional metadata.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        url (str): Absolute HTTP or HTTPS URL used by the operation.
        title (str | None): Title value consumed by this operation.
        note (str): Note value consumed by this operation.
        agentReview (str): Agentreview value consumed by this operation.
        viewed (bool): Viewed value consumed by this operation.
        tags (list[str] | None): Tags value consumed by this operation.
        groupId (str | None): Groupid value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
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
    """Update supplied fields on one active visible tab.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        id (str): Id value consumed by this operation.
        url (str | None): Absolute HTTP or HTTPS URL used by the operation.
        title (str | None): Title value consumed by this operation.
        note (str | None): Note value consumed by this operation.
        agentReview (str | None): Agentreview value consumed by this operation.
        viewed (bool | None): Viewed value consumed by this operation.
        tags (list[str] | None): Tags value consumed by this operation.
        position (float | None): Position value consumed by this operation.
        hiddenUntil (str | None): Hiddenuntil value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
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
    """Archive and Unassign one active visible tab.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        id (str): Id value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    client = api()
    _visible_tab(client, id)
    return client.request("DELETE", f"/tabs/{id}")


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def move_tab(
    id: str, targetGroupId: str | None = None, position: int | None = None
) -> dict[str, Any]:
    """PATCH one active visible tab into a Group or Unassigned.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        id (str): Id value consumed by this operation.
        targetGroupId (str | None): Targetgroupid value consumed by this operation.
        position (int | None): Position value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    client = api()
    _visible_tab(client, id)
    if targetGroupId is not None:
        _visible_group(client, targetGroupId)
    body: dict[str, Any] = {"groupId": targetGroupId}
    if position is not None:
        body["position"] = position
    return client.request("PATCH", f"/tabs/{id}", body)


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def reorder_tabs(tabIds: list[str], groupId: str | None = None) -> dict[str, Any]:
    """Apply one relative order to visible active tabs in a Group or Unassigned.

    The MCP boundary verifies that every supplied tab and non-null Group is visible before forwarding
    one transactional batch request. Omitted members keep their existing relative order after the
    supplied IDs, allowing agents to reorder only the records they can access.

    Args:
        tabIds (list[str]): Visible active Saved Tab IDs from first to last.
        groupId (str | None): Target Group identifier, or ``None`` for Unassigned.

    Returns:
        dict[str, Any]: Structured API success response confirming the accepted order.

    Raises:
        TabVaultApiError: A supplied tab or Group is hidden, archived, unavailable, or rejected by
            the local API.
    """
    client = api()
    if groupId is not None:
        _visible_group(client, groupId)
    for tab_id in tabIds:
        _visible_tab(client, tab_id)
    return client.request("PUT", "/tabs/order", {"groupId": groupId, "tabIds": tabIds})


@mcp.tool(annotations=READ, structured_output=True)
def list_groups(category: str | None = None, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    """List visible flat Groups, optionally restricted by category.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        category (str | None): Optional free-form Group category used to restrict results.
        limit (int): Maximum number of matching records to return.
        offset (int): Number of matching rows to skip before this page.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    return api().request(
        "GET",
        "/groups",
        query={
            "visibility": "visible",
            "category": category,
            "limit": limit,
            "offset": offset,
        },
    )


@mcp.tool(annotations=WRITE, structured_output=True)
def create_group(
    name: str,
    description: str = "",
    color: str | None = None,
) -> dict[str, Any]:
    """Create a Manual Group.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        name (str): Human-readable name used by the operation.
        description (str): Description value consumed by this operation.
        color (str | None): Color value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
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
    """Update a visible Group and explicitly reclassify it as manual.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        id (str): Id value consumed by this operation.
        name (str | None): Human-readable name used by the operation.
        description (str | None): Description value consumed by this operation.
        color (str | None): Color value consumed by this operation.
        position (float | None): Position value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
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
    """Delete a visible Group when it contains no hidden members.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        id (str): Id value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.

    Raises:
        TabVaultApiError: Propagated when its documented validation or operation condition occurs.
    """
    client = api()
    _visible_group(client, id)
    hidden = client.request(
        "GET",
        f"/groups/{id}/tabs",
        query={"visibility": "hidden", "fields": "minimal", "limit": 1},
    )
    if _page_data(hidden):
        raise TabVaultApiError("Group is not accessible through MCP")
    return client.request("DELETE", f"/groups/{id}")


@mcp.tool(annotations=READ, structured_output=True)
def list_tags(limit: int = 100, offset: int = 0) -> dict[str, Any]:
    """List known tags and their descriptions.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        limit (int): Maximum number of matching records to return.
        offset (int): Number of matching rows to skip before this page.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    return api().request("GET", "/tags", query={"limit": limit, "offset": offset})


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def tag_tab(tabId: str, tagName: str) -> dict[str, Any]:
    """Attach one tag to one tab.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        tabId (str): Tabid value consumed by this operation.
        tagName (str): Tagname value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    client = api()
    _visible_tab(client, tabId)
    return client.request("POST", f"/tabs/{tabId}/tags", {"tagName": tagName})


@mcp.tool(annotations=IDEMPOTENT_WRITE, structured_output=True)
def untag_tab(tabId: str, tagName: str) -> dict[str, Any]:
    """Detach one tag from one tab.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.

    Args:
        tabId (str): Tabid value consumed by this operation.
        tagName (str): Tagname value consumed by this operation.

    Returns:
        dict[str, Any]: Result produced by the operation described above.
    """
    client = api()
    _visible_tab(client, tabId)
    return client.request("DELETE", f"/tabs/{tabId}/tags/{tagName}")


def main() -> None:
    """Run the MCP server over its configured transport.

    This MCP-facing operation deliberately uses the public local HTTP API instead of database
    access, so agent actions observe the same visibility, validation, and transaction rules as other
    clients.
    """
    mcp.run()


if __name__ == "__main__":
    main()
