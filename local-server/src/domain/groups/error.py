class GroupError(Exception):
    code = "E_GROUP"
    status_code = 400
    path = "params.id"


class GroupNotFoundError(GroupError):
    code = "E_NOT_FOUND"
    status_code = 404


class GroupCycleError(GroupError):
    code = "E_CYCLIC_GROUP_REFERENCE"
    status_code = 409
    path = "body.parentId"


class GroupNotEmptyError(GroupError):
    code = "E_GROUP_NOT_EMPTY"
    status_code = 409
