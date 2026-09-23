"""Durable job errors."""

from domain.system.error import SystemDomainError


class JobNotFoundError(SystemDomainError):
    """A requested job does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
    path = "params.jobId"
