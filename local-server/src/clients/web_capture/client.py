"""SSRF-resistant streaming HTTP capture client."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

from config.settings import Settings

from .protocol import CapturedResponse


class CaptureRejectedError(ValueError):
    """Indicate that a remote capture violates safety or size limits.

    The client applies the backend's outbound-network safety policy before returning bounded
    response data to preview capture. It does not persist results or own database transactions.
    """


class WebCaptureClient:
    """Fetch bounded public HTTP resources for preview capture.

    The client applies the backend's outbound-network safety policy before returning bounded
    response data to preview capture. It does not persist results or own database transactions.

    Attributes:
        settings (Settings): Validated process settings shared for this instance lifetime.
    """

    def __init__(self, settings: Settings) -> None:
        """Initialize the client with capture limits and policy.

        The client applies the backend's outbound-network safety policy before returning bounded
        response data to preview capture. It does not persist results or own database transactions.

        Args:
            settings (Settings): Validated process settings that control this component.
        """
        self.settings = settings

    async def _validate_url(self, url: str) -> None:
        """Resolve and reject non-public destinations unless explicitly allowed.

        The client applies the backend's outbound-network safety policy before returning bounded
        response data to preview capture. It does not persist results or own database transactions.

        Args:
            url (str): Absolute HTTP or HTTPS URL used by the operation.

        Raises:
            CaptureRejectedError: The URL is not absolute HTTP(S) or resolves to a blocked
                private, loopback, link-local, or reserved address.
        """
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise CaptureRejectedError("Only absolute HTTP(S) URLs are allowed")
        if self.settings.preview_allow_private_hosts:
            return
        # Get addresses for the hostname (it calls C func from asyncio).
        addresses = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
        for address in addresses:
            # Get IP address from the address tuple.
            _, _, _, _, (ip_address, *_) = address
            ip = ipaddress.ip_address(ip_address)
            if not ip.is_global:
                raise CaptureRejectedError(
                    "Private, loopback, link-local, and reserved destinations are blocked"
                )

    async def _fetch(self, url: str, accepted: tuple[str, ...], limit: int) -> CapturedResponse:
        """Stream a validated resource with redirect and byte limits.

        The client applies the backend's outbound-network safety policy before returning bounded
        response data to preview capture. It does not persist results or own database transactions.

        Args:
            url (str): Absolute HTTP or HTTPS URL used by the operation.
            accepted (tuple[str, ...]): Allowed MIME types for this resource.
            limit (int): Maximum response body size in bytes.

        Returns:
            CapturedResponse: Validated response bytes, final URL, and media type after redirects.

        Raises:
            CaptureRejectedError: The URL, redirect, media type, response status, or byte
                count violates the capture policy.
        """
        current = url
        async with httpx.AsyncClient(timeout=self.settings.preview_timeout_seconds) as client:
            for _ in range(6):
                await self._validate_url(current)
                async with client.stream(
                    "GET",
                    current,
                    headers={"Accept": ",".join(accepted), "User-Agent": "TabVault/0.2"},
                ) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise CaptureRejectedError("Redirect had no location")
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
                    if not any(
                        content_type == value
                        or (value.endswith("/*") and content_type.startswith(value[:-1]))
                        for value in accepted
                    ):
                        raise CaptureRejectedError(
                            f"Unexpected content type {content_type or 'unknown'}"
                        )
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > limit:
                            raise CaptureRejectedError(
                                "Remote response exceeded the configured byte limit"
                            )
                    return CapturedResponse(bytes(data), content_type, str(response.url))
            raise CaptureRejectedError("Too many redirects")

    async def fetch_html(self, url: str) -> CapturedResponse:
        """Fetch an HTML document.

        The client applies the backend's outbound-network safety policy before returning bounded
        response data to preview capture. It does not persist results or own database transactions.

        Args:
            url (str): Absolute HTTP or HTTPS URL used by the operation.

        Returns:
            CapturedResponse: Validated HTML content and its final source URL.
        """
        return await self._fetch(
            url, ("text/html", "application/xhtml+xml"), self.settings.preview_max_html_bytes
        )

    async def fetch_image(self, url: str) -> CapturedResponse:
        """Fetch an image resource.

        The client applies the backend's outbound-network safety policy before returning bounded
        response data to preview capture. It does not persist results or own database transactions.

        Args:
            url (str): Absolute HTTP or HTTPS URL used by the operation.

        Returns:
            CapturedResponse: Validated image bytes and their final source URL.
        """
        return await self._fetch(url, ("image/*",), self.settings.preview_max_image_bytes)
