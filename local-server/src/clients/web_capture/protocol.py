"""Swappable web-capture interface and response value."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class CapturedResponse:
    """Contain captured bytes and resolved response metadata.

    The protocol keeps preview orchestration independent from the concrete network client and
    provides the structural contract used by dependency injection and tests.

    Attributes:
        content (bytes): Typed content value carried by this object.
        content_type (str): Typed content type value carried by this object.
        url (str): Original saved URL, preserved without canonicalization.
    """

    content: bytes
    content_type: str
    url: str


class WebCaptureProtocol(Protocol):
    """Define network operations required by preview capture.

    The protocol keeps preview orchestration independent from the concrete network client and
    provides the structural contract used by dependency injection and tests.
    """

    async def fetch_html(self, url: str) -> CapturedResponse:
        """Fetch validated HTML from an absolute URL.

        The protocol keeps preview orchestration independent from the concrete network client and
        provides the structural contract used by dependency injection and tests.

        Args:
            url (str): Absolute HTTP or HTTPS URL used by the operation.

        Returns:
            CapturedResponse: Result produced by the operation described above.
        """
        ...

    async def fetch_image(self, url: str) -> CapturedResponse:
        """Fetch a validated image from an absolute URL.

        The protocol keeps preview orchestration independent from the concrete network client and
        provides the structural contract used by dependency injection and tests.

        Args:
            url (str): Absolute HTTP or HTTPS URL used by the operation.

        Returns:
            CapturedResponse: Result produced by the operation described above.
        """
        ...
