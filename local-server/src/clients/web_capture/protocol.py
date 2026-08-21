"""Swappable web-capture interface and response value."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class CapturedResponse:
    """Contain captured bytes and resolved response metadata."""

    content: bytes
    content_type: str
    url: str


class WebCaptureProtocol(Protocol):
    """Define network operations required by preview capture."""

    async def fetch_html(self, url: str) -> CapturedResponse:
        """Fetch validated HTML from an absolute URL."""
        ...

    async def fetch_image(self, url: str) -> CapturedResponse:
        """Fetch a validated image from an absolute URL."""
        ...
