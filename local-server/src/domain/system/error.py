"""Framework-free system domain errors."""

from lib.responses import IssueDTO


class SystemDomainError(Exception):
    """Base error for system use cases.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_SYSTEM"
    status_code = 400
    path = "request"


class SemanticUnavailableError(SystemDomainError):
    """Indicate that required semantic search is unavailable.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_SEMANTIC_UNAVAILABLE"
    status_code = 503
    path = "query.mode"


class JobNotFoundError(SystemDomainError):
    """Indicate that a requested job does not exist.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.jobId"


class BackupNotFoundError(SystemDomainError):
    """Indicate that a requested backup does not exist.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class AssetNotFoundError(SystemDomainError):
    """Indicate that a requested asset does not exist.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class ImportValidationError(SystemDomainError):
    """Contain one or more portable-document validation issues.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_IMPORT_VALIDATION"
    status_code = 422
    path = "body"

    def __init__(self, errors: list[IssueDTO]) -> None:
        """Initialize the error with validation issues.

        Services raise this framework-independent domain exception so controllers or global handlers
        can choose the HTTP representation without coupling business logic to FastAPI.

        Args:
            errors (list[IssueDTO]): Structured issues collected while validating or processing
                input.
        """
        super().__init__("Import validation failed")
        self.errors = errors
