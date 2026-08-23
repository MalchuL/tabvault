"""Framework-free tag domain errors."""


class TagError(Exception):
    """Base error for tag use cases.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_TAG"
    status_code = 400
    path = "params.name"


class TagInUseError(TagError):
    """Prevent deletion of an attached tag without detachment.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_TAG_IN_USE"
    status_code = 409


class TagNotFoundError(TagError):
    """Indicate that a requested tag does not exist.

    Services raise this framework-independent domain exception so controllers or global handlers can
    choose the HTTP representation without coupling business logic to FastAPI.
    """

    code = "E_NOT_FOUND"
    status_code = 404
