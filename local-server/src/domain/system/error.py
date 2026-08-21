"""Framework-free system domain errors."""

from lib.responses import IssueDTO


class SystemDomainError(Exception):
    """Base error for system use cases."""

    code = "E_SYSTEM"
    status_code = 400
    path = "request"


class SemanticUnavailableError(SystemDomainError):
    """Indicate that required semantic search is unavailable."""

    code = "E_SEMANTIC_UNAVAILABLE"
    status_code = 503
    path = "query.mode"


class JobNotFoundError(SystemDomainError):
    """Indicate that a requested job does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.jobId"


class BackupNotFoundError(SystemDomainError):
    """Indicate that a requested backup does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class AssetNotFoundError(SystemDomainError):
    """Indicate that a requested asset does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class ImportValidationError(SystemDomainError):
    """Contain one or more portable-document validation issues."""

    code = "E_IMPORT_VALIDATION"
    status_code = 422
    path = "body"

    def __init__(self, errors: list[IssueDTO]) -> None:
        """Initialize the error with validation issues."""
        super().__init__("Import validation failed")
        self.errors = errors
