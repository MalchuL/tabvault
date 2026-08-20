class TabError(Exception):
    code = "E_TAB"
    status_code = 400
    path = "params.id"


class TabNotFoundError(TabError):
    code = "E_NOT_FOUND"
    status_code = 404


class InvalidGroupError(TabError):
    code = "E_INVALID_REFERENCE"
    status_code = 409
    path = "body.groupId"


class ActiveTabDeleteError(TabError):
    code = "E_NOT_ARCHIVED"
    status_code = 409


class EmptyUpdateError(TabError):
    code = "E_EMPTY_UPDATE"
    status_code = 422
    path = "body"


class InvalidCursorError(TabError):
    code = "E_INVALID_CURSOR"
    status_code = 422
    path = "query.cursor"
