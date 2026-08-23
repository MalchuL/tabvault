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
    """List Saved Tabs using filters and cursor pagination."""
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
    """Create exactly one Saved Tab occurrence."""
    tab, job = await service.create(body)
    request.app.state.worker.wake()
    return success(tab, meta=TabCreateMetaDTO(job=job))


@router.get("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def get_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Get one Saved Tab."""
    return success(await service.get(tab_id))


@router.patch("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def update_tab(
    tab_id: str, body: TabUpdateDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Patch one Saved Tab, including move or restore state."""
    return success(await service.update(tab_id, body))


@router.delete("/{tab_id}", response_model=SuccessResponseDTO[TabDeleteResultDTO])
async def delete_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)], hard: bool = False
) -> SuccessResponseDTO[TabDeleteResultDTO]:
    """Archive or permanently delete one Saved Tab."""
    return success(await service.delete(tab_id, hard))


@router.post("/{tab_id}/tags", response_model=SuccessResponseDTO[TabDTO])
async def tag_tab(
    tab_id: str, body: TabTagDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Attach one tag to one Saved Tab."""
    tab, warnings = await service.tag(tab_id, body.tag_name, True)
    return success(tab, warnings=warnings)


@router.delete("/{tab_id}/tags/{tag_name}", response_model=SuccessResponseDTO[TabDTO])
async def untag_tab(
    tab_id: str, tag_name: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Detach one tag from one Saved Tab."""
    tab, warnings = await service.tag(tab_id, tag_name, False)
    return success(tab, warnings=warnings)
