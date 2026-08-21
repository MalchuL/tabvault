"""Framework-free group domain errors."""


class GroupError(Exception):
    """Base error for group use cases."""

    code = "E_GROUP"
    status_code = 400
    path = "params.id"


class GroupNotFoundError(GroupError):
    """Indicate that a requested group does not exist."""

    code = "E_NOT_FOUND"
    status_code = 404


class GroupCycleError(GroupError):
    """Prevent a cyclic parent relationship."""

    code = "E_CYCLIC_GROUP_REFERENCE"
    status_code = 409
    path = "body.parentId"


class GroupNotEmptyError(GroupError):
    """Prevent rejection-mode deletion of a non-empty group."""

    code = "E_GROUP_NOT_EMPTY"
    status_code = 409
