from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class CapturedResponse:
    content: bytes
    content_type: str
    url: str


class WebCaptureProtocol(Protocol):
    async def fetch_html(self, url: str) -> CapturedResponse: ...
    async def fetch_image(self, url: str) -> CapturedResponse: ...
