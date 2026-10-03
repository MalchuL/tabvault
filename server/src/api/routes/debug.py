"""Opt-in browser request playground with automatic API-key authentication."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from config.settings import Settings, get_settings

DEBUG_WARNING = (
    "UNSAFE DEBUG MODE: the playground embeds the server API key and can change live data. "
    "Disable with TABVAULT_DEBUG__ENABLED=false and restart the server."
)
router = APIRouter()


@router.get("/debug", response_class=HTMLResponse, include_in_schema=False)
async def playground(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> HTMLResponse:
    """Serve a styled API playground only when both debug switches are enabled.

    Browser navigation requires no authentication header: this deliberately unsafe
    debug page embeds the configured key and preauthorizes Swagger's API requests.
    Escaping prevents key contents from becoming executable markup; no-store avoids
    cached credentials and suppresses response-body previews in access logs.

    Args:
        request (Request): Incoming request used to resolve the mounted OpenAPI URL.
        settings (Annotated[Settings, Depends(get_settings)]): Runtime debug options and API key.

    Returns:
        HTMLResponse: Interactive API documentation with a warning and prefilled authentication.

    Raises:
        HTTPException: Debug mode or the playground option is disabled (HTTP 404).
    """
    if not settings.debug.enabled or not settings.debug.playground_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    response = get_swagger_ui_html(
        openapi_url=request.url_for("openapi").path,
        title="TabVault debug playground",
        swagger_ui_parameters={"tryItOutEnabled": True, "persistAuthorization": False},
    )
    api_key = (
        json.dumps(settings.http.api_key or "")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
    html = (
        bytes(response.body)
        .decode()
        .replace(
            "SwaggerUIBundle({",
            "SwaggerUIBundle({\n"
            f'    onComplete: () => ui.preauthorizeApiKey("API Key", {api_key}),',
        )
    )
    html = html.replace(
        "<body>",
        f"""<body>
        <aside role="alert" style="margin:24px;padding:20px;border:2px solid #b42318;
            border-radius:8px;background:#fff4ed;color:#7a271a;font:16px/1.6 system-ui">
            <strong>{DEBUG_WARNING}</strong>
            <p>Expand <b>tabs</b> or <b>groups</b>, choose an operation, edit the JSON
            body, and click <b>Execute</b>. List operations use GET. The API key is
            applied automatically; requests affect the current database.</p>
        </aside>""",
    )
    return HTMLResponse(
        html, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
    )
