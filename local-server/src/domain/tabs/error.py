"""Framework-free Saved Tab domain errors."""


class TabError(Exception):
    """Base error for Saved Tab use cases.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_TAB"
    status_code = 400
    path = "params.id"


class TabNotFoundError(TabError):
    """Indicate that a requested Saved Tab does not exist.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_FOUND"
    status_code = 404


class DuplicateTabIdError(TabError):
    """Reject reuse of an existing Saved Tab identity.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_DUPLICATE_ID"
    status_code = 409
    path = "body.id"


class InvalidGroupError(TabError):
    """Indicate that a requested Group reference is invalid.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_INVALID_REFERENCE"
    status_code = 409
    path = "body.groupId"


class ActiveTabDeleteError(TabError):
    """Prevent permanent deletion of an active Saved Tab.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_ARCHIVED"
    status_code = 409


class EmptyUpdateError(TabError):
    """Reject a PATCH request without supplied fields.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_EMPTY_UPDATE"
    status_code = 422
    path = "body"
