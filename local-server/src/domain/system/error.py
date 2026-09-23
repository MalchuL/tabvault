"""Base error shared by API domain slices."""


class SystemDomainError(Exception):
    """Framework-independent domain error mapped by the API boundary."""

    code = "E_SYSTEM"
    status_code = 400
    path = "request"
