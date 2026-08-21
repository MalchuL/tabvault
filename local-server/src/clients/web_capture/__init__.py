"""Outbound web-capture client package."""

from .client import WebCaptureClient
from .protocol import CapturedResponse, WebCaptureProtocol

__all__ = ["CapturedResponse", "WebCaptureClient", "WebCaptureProtocol"]
