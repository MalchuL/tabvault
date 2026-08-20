class SystemDomainError(Exception):
    code = "E_SYSTEM"
    status_code = 400
    path = "request"


class SemanticUnavailableError(SystemDomainError):
    code = "E_SEMANTIC_UNAVAILABLE"
    status_code = 503
    path = "query.mode"


class JobNotFoundError(SystemDomainError):
    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.jobId"


class BackupNotFoundError(SystemDomainError):
    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class AssetNotFoundError(SystemDomainError):
    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.id"


class ImportValidationError(SystemDomainError):
    code = "E_IMPORT_VALIDATION"
    status_code = 422
    path = "body"

    def __init__(self, errors: list[dict[str, object]]) -> None:
        super().__init__("Import validation failed")
        self.errors = errors
