"""Framework-free tab domain errors."""


class TabError(Exception):
    """Base error for tab use cases."""

    code = "E_TAB"
    status_code = 400
    path = "params.id"


class TabNotFoundError(TabError):
    """Indicate that a requested tab does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404


class InvalidGroupError(TabError):
    """Indicate that a requested group reference is invalid."""

    code = "E_INVALID_REFERENCE"
    status_code = 409
    path = "body.groupId"


class ActiveTabDeleteError(TabError):
    """Prevent permanent deletion of an active tab."""

    code = "E_NOT_ARCHIVED"
    status_code = 409


class EmptyUpdateError(TabError):
    """Reject an update with no supplied fields."""

    code = "E_EMPTY_UPDATE"
    status_code = 422
    path = "body"


class InvalidCursorError(TabError):
    """Indicate that a pagination cursor is invalid."""

    code = "E_INVALID_CURSOR"
    status_code = 422
    path = "query.cursor"
