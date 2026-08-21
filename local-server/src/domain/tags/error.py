"""Framework-free tag domain errors."""


class TagError(Exception):
    """Base error for tag use cases."""

    code = "E_TAG"
    status_code = 400
    path = "params.name"


class TagInUseError(TagError):
    """Prevent deletion of an attached tag without detachment."""

    code = "E_TAG_IN_USE"
    status_code = 409


class TagNotFoundError(TagError):
    """Indicate that a requested tag does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404
