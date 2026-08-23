"""Framework-free Group domain errors."""


class GroupError(Exception):
    """Base error for Group use cases.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_GROUP"
    status_code = 400
    path = "params.id"


class GroupNotFoundError(GroupError):
    """Indicate that a requested Group does not exist.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_FOUND"
    status_code = 404


class EmptyGroupUpdateError(GroupError):
    """Reject a PATCH request without supplied fields.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_EMPTY_UPDATE"
    status_code = 422
    path = "body"
