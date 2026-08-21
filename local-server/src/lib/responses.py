"""Typed HTTP response envelopes shared by every API domain."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

from lib.dto_config import model_config

DataT = TypeVar("DataT")


class WarningDTO(BaseModel):
    """Describe a non-fatal API warning."""

    code: str
    path: str
    message: str
    model_config = model_config()


class IssueDTO(WarningDTO):
    """Describe a validation or domain error returned by the API."""

    expected: str
    received: Any = None
    http_status: int
    suggested_fix: str | None = None


class SuccessResponseDTO(BaseModel, Generic[DataT]):
    """Wrap a successful API result."""

    success: bool = True
    data: DataT
    meta: Any | None = Field(default=None, exclude_if=lambda value: value is None)
    warnings: list[WarningDTO] | None = Field(default=None, exclude_if=lambda value: value is None)
    errors: list[IssueDTO] | None = Field(default=None, exclude_if=lambda value: value is None)
    model_config = model_config()


class FailureResponseDTO(BaseModel):
    """Wrap one or more API errors."""

    success: bool = False
    errors: list[IssueDTO]
    warnings: list[WarningDTO] = Field(default_factory=list)
    model_config = model_config()


def success(
    data: DataT,
    *,
    meta: Any | None = None,
    warnings: list[WarningDTO] | None = None,
    errors: list[IssueDTO] | None = None,
) -> SuccessResponseDTO[DataT]:
    """Build a typed success envelope.

    Args:
        data: Response payload.
        meta: Optional endpoint metadata.
        warnings: Optional non-fatal warnings.
        errors: Optional per-item errors for partial-success operations.

    Returns:
        A success response DTO.
    """
    return SuccessResponseDTO(data=data, meta=meta, warnings=warnings, errors=errors)


def issue(
    code: str,
    path: str,
    expected: str,
    received: Any,
    message: str,
    http_status: int,
    suggested_fix: str | None = None,
) -> IssueDTO:
    """Build a typed API issue.

    Args:
        code: Stable error code.
        path: Request path associated with the issue.
        expected: Human-readable expected value.
        received: Rejected value.
        message: Human-readable explanation.
        http_status: Associated HTTP status code.
        suggested_fix: Optional remediation hint.

    Returns:
        A populated issue DTO.
    """
    return IssueDTO(
        code=code,
        path=path,
        expected=expected,
        received=received,
        message=message,
        http_status=http_status,
        suggested_fix=suggested_fix,
    )


def failure(errors: list[IssueDTO], warnings: list[WarningDTO] | None = None) -> FailureResponseDTO:
    """Build a typed failure envelope.

    Args:
        errors: Fatal API issues.
        warnings: Optional non-fatal warnings.

    Returns:
        A failure response DTO.
    """
    return FailureResponseDTO(errors=errors, warnings=warnings or [])


def json_data(dto: BaseModel) -> dict[str, Any]:
    """Serialize a DTO for an explicit ``JSONResponse``.

    Args:
        dto: DTO to serialize.

    Returns:
        JSON-compatible camelCase data.
    """
    return dto.model_dump(mode="json", by_alias=True, exclude_none=True)
