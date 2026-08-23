"""HTTP routes for Saved Tab use cases."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from api.routes.service_dependencies import get_tab_service
from lib.responses import SuccessResponseDTO, success

from .dto import (
    TabCreateDTO,
    TabCreateMetaDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabListDataDTO,
    TabListOptionsDTO,
    TabTagDTO,
    TabUpdateDTO,
)
from .service import TabService
from .visibility import TabVisibility

router = APIRouter(prefix="/tabs", tags=["tabs"])


@router.get(
    "", response_model=SuccessResponseDTO[TabListDataDTO], response_model_exclude_unset=True
)
async def list_tabs(
    service: Annotated[TabService, Depends(get_tab_service)],
    group_id: str = Query("all", alias="groupId"),
    category: str | None = None,
    tags: str = "",
    tags_all: str = Query("", alias="tagsAll"),
    search: str | None = None,
    sort_by: Literal["position", "createdAt", "updatedAt", "title"] = Query(
        "position", alias="sortBy"
    ),
    sort_dir: Literal["asc", "desc"] = Query("asc", alias="sortDir"),
    limit: int = Query(50, ge=1),
    cursor: str | None = None,
    fields: str = "full",
    visibility: TabVisibility = "visible",
) -> SuccessResponseDTO[TabListDataDTO]:
    """List Saved Tabs using filters and cursor pagination.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.
        group_id (str): Stable identifier of the group targeted by the operation.
        category (str | None): Optional free-form Group category used to restrict results.
        tags (str): Tags value consumed by this operation.
        tags_all (str): Tags all value consumed by this operation.
        search (str | None): Search value consumed by this operation.
        sort_by (Literal["position", "createdAt", "updatedAt", "title"]): Sort by value consumed by
            this operation.
        sort_dir (Literal["asc", "desc"]): Directory used to store sort data.
        limit (int): Maximum number of matching records to return.
        cursor (str | None): Opaque keyset cursor returned by an earlier page, or ``None`` for the
            first page.
        fields (str): Requested response projection controlling which fields are serialized.
        visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.

    Returns:
        SuccessResponseDTO[TabListDataDTO]: Result produced by the operation described above.
    """
    result = await service.list(
        TabListOptionsDTO(
            group_id=group_id,
            category=category,
            tags_any=[value for value in tags.split(",") if value],
            tags_all=[value for value in tags_all.split(",") if value],
            search=search,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            requested_limit=limit,
            cursor=cursor,
            fields=fields,
            visibility=visibility,
        )
    )
    return success(TabListDataDTO(tabs=result.tabs), meta=result.meta, warnings=result.warnings)


@router.post("", status_code=201, response_model=SuccessResponseDTO[TabDTO])
async def create_tab(
    body: TabCreateDTO,
    request: Request,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[TabDTO]:
    """Create exactly one Saved Tab occurrence.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        body (TabCreateDTO): Validated request body supplied by the caller.
        request (Request): Incoming FastAPI request, including its headers and body.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Result produced by the operation described above.
    """
    tab, job = await service.create(body)
    request.app.state.worker.wake()
    return success(tab, meta=TabCreateMetaDTO(job=job))


@router.get("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def get_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Get one Saved Tab.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Result produced by the operation described above.
    """
    return success(await service.get(tab_id))


@router.patch("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def update_tab(
    tab_id: str, body: TabUpdateDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Patch one Saved Tab, including move or restore state.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        body (TabUpdateDTO): Validated request body supplied by the caller.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Result produced by the operation described above.
    """
    return success(await service.update(tab_id, body))


@router.delete("/{tab_id}", response_model=SuccessResponseDTO[TabDeleteResultDTO])
async def delete_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)], hard: bool = False
) -> SuccessResponseDTO[TabDeleteResultDTO]:
    """Archive or permanently delete one Saved Tab.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.
        hard (bool): Whether to permanently delete an already archived record instead of archiving
            it.

    Returns:
        SuccessResponseDTO[TabDeleteResultDTO]: Result produced by the operation described above.
    """
    return success(await service.delete(tab_id, hard))


@router.post("/{tab_id}/tags", response_model=SuccessResponseDTO[TabDTO])
async def tag_tab(
    tab_id: str, body: TabTagDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Attach one tag to one Saved Tab.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        body (TabTagDTO): Validated request body supplied by the caller.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Result produced by the operation described above.
    """
    tab, warnings = await service.tag(tab_id, body.tag_name, True)
    return success(tab, warnings=warnings)


@router.delete("/{tab_id}/tags/{tag_name}", response_model=SuccessResponseDTO[TabDTO])
async def untag_tab(
    tab_id: str, tag_name: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Detach one tag from one Saved Tab.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        tag_name (str): Tag name value consumed by this operation.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Result produced by the operation described above.
    """
    tab, warnings = await service.tag(tab_id, tag_name, False)
    return success(tab, warnings=warnings)
