from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from domain.groups.error import GroupError
from domain.system.error import ImportValidationError, SystemDomainError
from domain.tabs.error import TabError
from domain.tags.error import TagError
from lib.responses import failure, issue

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError) -> JSONResponse:
        errors = []
        for item in error.errors():
            location = list(item["loc"])
            root = location.pop(0) if location else "request"
            path = root + ("." + ".".join(str(part) for part in location) if location else "")
            errors.append(
                issue("E_INVALID_FIELD", path, item["type"], item.get("input"), item["msg"], 422)
            )
        return JSONResponse(failure(errors), status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException) -> JSONResponse:
        detail: Any = error.detail
        if isinstance(detail, dict) and "code" in detail:
            item = detail
        else:
            item = issue(
                "E_HTTP_ERROR",
                "request",
                "valid request",
                None,
                str(detail),
                error.status_code,
            )
        return JSONResponse(failure([item]), status_code=error.status_code, headers=error.headers)

    async def domain_error(_request: Request, error: Exception) -> JSONResponse:
        if isinstance(error, ImportValidationError):
            return JSONResponse(failure(error.errors), status_code=422)
        value: Any = error
        return JSONResponse(
            failure(
                [issue(value.code, value.path, "valid value", None, str(value), value.status_code)]
            ),
            status_code=value.status_code,
        )

    for error_type in (TabError, GroupError, TagError, SystemDomainError):
        app.add_exception_handler(error_type, domain_error)

    @app.exception_handler(Exception)
    async def unhandled(_request: Request, error: Exception) -> JSONResponse:
        logger.exception("Unhandled API error", exc_info=error)
        return JSONResponse(
            failure(
                [
                    issue(
                        "E_INTERNAL",
                        "request",
                        "successful operation",
                        None,
                        "Internal server error.",
                        500,
                    )
                ]
            ),
            status_code=500,
        )
