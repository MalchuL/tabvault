"""Transfer and backup errors."""

from domain.system.error import SystemDomainError
from lib.responses import IssueDTO


class BackupNotFoundError(SystemDomainError):
    """A requested backup does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class ImportValidationError(SystemDomainError):
    """Portable-document validation failed."""

    code = "E_IMPORT_VALIDATION"
    status_code = 422
    path = "body"

    def __init__(self, errors: list[IssueDTO]) -> None:
        """Retain all validation issues for the API error response."""
        super().__init__("Import validation failed")
        self.errors = errors
