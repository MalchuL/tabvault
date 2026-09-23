"""Search domain errors."""

from domain.system.error import SystemDomainError


class SemanticUnavailableError(SystemDomainError):
    """Required semantic search is unavailable."""

    code = "E_SEMANTIC_UNAVAILABLE"
    status_code = 503
    path = "query.mode"
