class TagError(Exception):
    code = "E_TAG"
    status_code = 400
    path = "params.name"


class TagInUseError(TagError):
    code = "E_TAG_IN_USE"
    status_code = 409


class TagNotFoundError(TagError):
    code = "E_NOT_FOUND"
    status_code = 404
