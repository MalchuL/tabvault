from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

from config.settings import Settings

from .protocol import CapturedResponse


class CaptureRejectedError(ValueError):
    pass


class WebCaptureClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def _validate_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise CaptureRejectedError("Only absolute HTTP(S) URLs are allowed")
        if self.settings.preview_allow_private_hosts:
            return
        addresses = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise CaptureRejectedError(
                    "Private, loopback, link-local, and reserved destinations are blocked"
                )

    async def _fetch(self, url: str, accepted: tuple[str, ...], limit: int) -> CapturedResponse:
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
        return await self._fetch(
            url, ("text/html", "application/xhtml+xml"), self.settings.preview_max_html_bytes
        )

    async def fetch_image(self, url: str) -> CapturedResponse:
        return await self._fetch(url, ("image/*",), self.settings.preview_max_image_bytes)
