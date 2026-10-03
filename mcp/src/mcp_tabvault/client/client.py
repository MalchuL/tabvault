"""Provide the asynchronous typed client for the TabVault HTTP API."""

from __future__ import annotations

import os
from typing import Any, TypeVar, cast

import httpx
from pydantic import BaseModel, ValidationError

from .dto import (
    FailureResponseDTO,
    GroupCreateDTO,
    GroupDeleteResponseDTO,
    GroupListQueryDTO,
    GroupListResponseDTO,
    GroupResponseDTO,
    GroupTabsQueryDTO,
    GroupUpdateDTO,
    PropertyDefinitionDTO,
    PropertySchemaResponseDTO,
    PropertyUnsetDTO,
    SearchQueryDTO,
    SearchResponseDTO,
    TabCreateDTO,
    TabCreateResponseDTO,
    TabDeleteResponseDTO,
    TabListQueryDTO,
    TabListResponseDTO,
    TabReorderDTO,
    TabReorderResponseDTO,
    TabResponseDTO,
    TabTagDTO,
    TabUpdateDTO,
    TagListQueryDTO,
    TagListResponseDTO,
)

DEFAULT_SERVER_URL = "http://127.0.0.1:47821"
ResponseT = TypeVar("ResponseT", bound=BaseModel)


class MCPClientError(RuntimeError):
    """Report an unavailable, unsuccessful, or invalid TabVault API response."""


class MCPClient:
    """Send typed authenticated requests to the public TabVault API.

    One instance owns a persistent ``httpx.AsyncClient`` for the MCP server lifespan. Public
    methods accept validated request/query DTOs and return validated response DTOs, keeping raw JSON
    mappings private to :meth:`_request`.

    Attributes:
        base_url (str): Server origin without a trailing slash.
        api_key (str | None): Optional API key sent with every request.
    """

    def __init__(self, base_url: str, api_key: str | None = None) -> None:
        """Create a reusable asynchronous API client.

        Args:
            base_url (str): TabVault server origin, without the ``/api/v1`` suffix.
            api_key (str | None): Optional key sent in the ``X-API-Key`` header.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if api_key:
            headers["X-API-Key"] = api_key
        self._http = httpx.AsyncClient(
            base_url=f"{self.base_url}/api/v1/", headers=headers, timeout=30.0
        )

    @classmethod
    def from_environment(cls) -> MCPClient:
        """Create a client from process-level server and authentication settings.

        Returns:
            MCPClient: Client configured from ``TABVAULT_SERVER_URL`` and ``TABVAULT_HTTP__API_KEY``.
        """
        return cls(
            os.environ.get("TABVAULT_SERVER_URL", DEFAULT_SERVER_URL),
            os.environ.get("TABVAULT_HTTP__API_KEY") or None,
        )

    async def aclose(self) -> None:
        """Close the persistent HTTP connection pool."""
        await self._http.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        response_type: type[ResponseT],
        *,
        body: BaseModel | None = None,
        query: BaseModel | None = None,
    ) -> ResponseT:
        """Send one request and validate its response as the requested DTO.

        Args:
            method (str): HTTP method used for the request.
            path (str): Path below the fixed ``/api/v1`` prefix.
            response_type (type[ResponseT]): Pydantic DTO class used to validate the response.
            body (BaseModel | None): Optional typed JSON request body.
            query (BaseModel | None): Optional typed query parameters.

        Returns:
            ResponseT: Validated response DTO.

        Raises:
            MCPClientError: The request fails, the API rejects it, or its response is malformed.
        """
        try:
            response = await self._http.request(
                method,
                path.lstrip("/"),
                json=(
                    body.model_dump(mode="json", by_alias=True, exclude_unset=True)
                    if body is not None
                    else None
                ),
                params=(self._query_parameters(query) if query is not None else None),
            )
        except httpx.RequestError as error:
            raise MCPClientError(f"TabVault API is unavailable: {error}") from error

        if response.is_error:
            try:
                payload = cast(object, response.json())
                failure = FailureResponseDTO.model_validate(payload)
                detail = "; ".join(issue.message for issue in failure.errors)
            except (ValueError, ValidationError):
                detail = response.text
            raise MCPClientError(f"TabVault API returned {response.status_code}: {detail}")

        payload: object
        try:
            payload = cast(object, response.json())
        except ValueError as error:
            raise MCPClientError(
                f"TabVault API returned invalid JSON with status {response.status_code}"
            ) from error

        try:
            return response_type.model_validate(payload)
        except ValidationError as error:
            raise MCPClientError("TabVault API returned an invalid response shape") from error

    async def _ensure_properties(self, values: dict[str, Any]) -> None:
        """Register missing client conventions only for explicitly written properties.

        Args:
            values (dict[str, Any]): Explicit custom-property patch.

        Raises:
            MCPClientError: A convention has an incompatible existing definition.
        """
        if not values:
            return
        conventions = {
            "note": {"type": "string", "default": "", "description": "Saved note"},
            "agentReview": {"type": "string", "default": "", "description": "Agent-written review"},
            "viewed": {
                "type": "boolean",
                "default": False,
                "description": "Whether this saved tab has been viewed",
            },
        }
        schema = await self.property_schema()
        for name in values:
            expected = conventions.get(name)
            if expected is None:
                continue
            existing = schema.data.properties.get(name)
            if existing is not None and existing.type != expected["type"]:
                raise MCPClientError(
                    f"Property {name!r} must have type {expected['type']} for this operation"
                )
            if existing is None:
                await self.upsert_property(
                    PropertyDefinitionDTO.model_validate({"name": name, **expected})
                )

    async def property_schema(self) -> PropertySchemaResponseDTO:
        """Read definitions without modifying server state."""
        return await self._request("GET", "/property-schema", PropertySchemaResponseDTO)

    async def upsert_property(self, body: PropertyDefinitionDTO) -> PropertySchemaResponseDTO:
        """Create or explicitly replace one property definition."""
        return await self._request("POST", "/property-schema", PropertySchemaResponseDTO, body=body)

    async def delete_property(self, name: str) -> PropertySchemaResponseDTO:
        """Remove a definition while retaining existing raw tab values."""
        from urllib.parse import quote

        return await self._request(
            "DELETE", f"/property-schema/{quote(name, safe='')}", PropertySchemaResponseDTO
        )

    async def unset_properties(self, tab_id: str, names: list[str]) -> TabResponseDTO:
        """Remove explicit values from a previously resolved visible occurrence."""
        return await self._request(
            "POST",
            f"/tabs/{tab_id}/custom-properties/unset",
            TabResponseDTO,
            body=PropertyUnsetDTO(properties=names),
        )

    @staticmethod
    def _query_parameters(query: BaseModel) -> dict[str, str | int | float | bool | None]:
        """Serialize grouped list inputs as ordinary HTTP query parameters.

        Args:
            query (BaseModel): Validated query object.

        Returns:
            dict[str, object]: Flat query values with camelCase parameter names.
        """
        if isinstance(query, TabListQueryDTO):
            return {
                **query.filters.model_dump(mode="json", by_alias=True, exclude_none=True),
                **query.ordering.model_dump(mode="json", by_alias=True),
                **query.pagination.model_dump(mode="json", by_alias=True),
                "fields": query.fields,
            }
        return query.model_dump(mode="json", by_alias=True, exclude_none=True)

    async def list_tabs(self, query: TabListQueryDTO) -> TabListResponseDTO:
        """List Saved Tabs using typed filters and pagination."""
        return await self._request("GET", "/tabs", TabListResponseDTO, query=query)

    async def search_tabs(self, query: SearchQueryDTO) -> SearchResponseDTO:
        """Search Saved Tabs by meaning and text."""
        return await self._request("GET", "/search", SearchResponseDTO, query=query)

    async def get_tab(self, tab_id: str) -> TabResponseDTO:
        """Get one Saved Tab by identifier."""
        return await self._request("GET", f"/tabs/{tab_id}", TabResponseDTO)

    async def create_tab(self, body: TabCreateDTO) -> TabCreateResponseDTO:
        """Create one Saved Tab occurrence, registering viewed only when supplied.

        Args:
            body (TabCreateDTO): Validated tab fields, including optional custom properties.

        Returns:
            TabCreateResponseDTO: Created occurrence and capture-job metadata.

        Raises:
            MCPClientError: Schema registration or creation fails, or viewed is incompatible.
        """
        await self._ensure_properties(body.annotations.custom_properties)
        return await self._request("POST", "/tabs", TabCreateResponseDTO, body=body)

    async def update_tab(self, tab_id: str, body: TabUpdateDTO) -> TabResponseDTO:
        """Patch one Saved Tab, registering viewed only when supplied.

        Args:
            tab_id (str): Private identifier of the tab selected by the caller.
            body (TabUpdateDTO): Validated fields to update; omitted fields stay unchanged.

        Returns:
            TabResponseDTO: Updated Saved Tab.

        Raises:
            MCPClientError: Schema registration or update fails, or viewed is incompatible.
        """
        if body.annotations.custom_properties is not None:
            await self._ensure_properties(body.annotations.custom_properties)
        return await self._request("PATCH", f"/tabs/{tab_id}", TabResponseDTO, body=body)

    async def delete_tab(self, tab_id: str) -> TabDeleteResponseDTO:
        """Archive one active Saved Tab."""
        return await self._request("DELETE", f"/tabs/{tab_id}", TabDeleteResponseDTO)

    async def reorder_tabs(self, body: TabReorderDTO) -> TabReorderResponseDTO:
        """Apply one relative Saved Tab order."""
        return await self._request("PUT", "/tabs/order", TabReorderResponseDTO, body=body)

    async def list_group_tabs(self, group_id: str, query: GroupTabsQueryDTO) -> TabListResponseDTO:
        """List Saved Tabs within one Group using a visibility scope."""
        return await self._request(
            "GET", f"/groups/{group_id}/tabs", TabListResponseDTO, query=query
        )

    async def list_groups(self, query: GroupListQueryDTO) -> GroupListResponseDTO:
        """List flat Groups using typed filters and pagination."""
        return await self._request("GET", "/groups", GroupListResponseDTO, query=query)

    async def create_group(self, body: GroupCreateDTO) -> GroupResponseDTO:
        """Create one Manual Group."""
        return await self._request("POST", "/groups", GroupResponseDTO, body=body)

    async def update_group(self, group_id: str, body: GroupUpdateDTO) -> GroupResponseDTO:
        """Patch explicitly supplied fields on one Group."""
        return await self._request("PATCH", f"/groups/{group_id}", GroupResponseDTO, body=body)

    async def delete_group(self, group_id: str) -> GroupDeleteResponseDTO:
        """Delete one Group."""
        return await self._request("DELETE", f"/groups/{group_id}", GroupDeleteResponseDTO)

    async def list_tags(self, query: TagListQueryDTO) -> TagListResponseDTO:
        """List tags using typed pagination."""
        return await self._request("GET", "/tags", TagListResponseDTO, query=query)

    async def tag_tab(self, tab_id: str, body: TabTagDTO) -> TabResponseDTO:
        """Attach one tag to one Saved Tab."""
        return await self._request("POST", f"/tabs/{tab_id}/tags", TabResponseDTO, body=body)

    async def untag_tab(self, tab_id: str, tag_name: str) -> TabResponseDTO:
        """Detach one tag from one Saved Tab."""
        return await self._request("DELETE", f"/tabs/{tab_id}/tags/{tag_name}", TabResponseDTO)
