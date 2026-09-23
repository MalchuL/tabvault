"""Framework-free Custom Property domain errors."""

from __future__ import annotations

from typing import Any


class CustomPropertyError(Exception):
    """Base error for Custom Property Schema and value use cases."""

    code = "E_CUSTOM_PROPERTY"
    status_code = 422
    path = "body.customProperties"


class InvalidCustomPropertiesError(CustomPropertyError):
    """Reject an atomic property mutation containing invalid or unknown values.

    Attributes:
        received (Any): Rejected property value retained for the API error response.
    """

    def __init__(self, message: str, *, received: Any = None) -> None:
        """Capture the rejected property input for the shared error renderer.

        Args:
            message (str): Human-readable validation failure.
            received (Any): Rejected input safe to include in the local API response.
        """
        super().__init__(message)
        self.received = received


class PropertyDefinitionNotFoundError(CustomPropertyError):
    """Indicate that a requested schema definition does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.propertyName"
