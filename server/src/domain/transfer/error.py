"""Transfer and backup errors."""

from domain.system.error import SystemDomainError
from lib.responses import IssueDTO


class BackupNotFoundError(SystemDomainError):
    """A requested backup does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class DatabaseBackupDisabledError(SystemDomainError):
    """Manual database backup requests are disabled by server configuration."""

    code = "E_DATABASE_BACKUP_DISABLED"
    status_code = 403


class DatabaseBackupUnsupportedError(SystemDomainError):
    """The active database is not a file-backed SQLite database."""

    code = "E_DATABASE_BACKUP_UNSUPPORTED"
    status_code = 503


class ImportValidationError(SystemDomainError):
    """Portable-document validation failed.

    Attributes:
        errors (list[IssueDTO]): Validation issues exposed to the API error renderer.
    """

    code = "E_IMPORT_VALIDATION"
    status_code = 422
    path = "body"

    def __init__(self, errors: list[IssueDTO]) -> None:
        """Retain all validation issues for the API error response.

        Args:
            errors (list[IssueDTO]): Validation issues carried by the import exception.
        """
        super().__init__("Import validation failed")
        self.errors = errors
