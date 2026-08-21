"""HTTP routes for tab use cases."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from api.routes.service_dependencies import get_tab_service
from lib.responses import SuccessResponseDTO, success

from .dto import (
    BatchDeleteDTO,
    TabBatchCreateDTO,
    TabBatchDeleteResultDTO,
    TabCreateDataDTO,
    TabCreateMetaDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabListDataDTO,
    TabListOptionsDTO,
    TabMoveDTO,
    TabRestoreDTO,
    TabRestoreResultDTO,
    TabTagDTO,
    TabUpdateDTO,
)
from .service import TabService

router = APIRouter(prefix="/tabs", tags=["tabs"])


@router.get(
    "",
    response_model=SuccessResponseDTO[TabListDataDTO],
    response_model_exclude_unset=True,
)
async def list_tabs(
    service: Annotated[TabService, Depends(get_tab_service)],
    group_id: str = Query("all", alias="groupId"),
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
    include_archived: bool = Query(False, alias="includeArchived"),
) -> SuccessResponseDTO[TabListDataDTO]:
    """List tabs using filters and cursor pagination."""
    result = await service.list(
        TabListOptionsDTO(
            group_id=group_id,
            tags_any=[x for x in tags.split(",") if x],
            tags_all=[x for x in tags_all.split(",") if x],
            search=search,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            requested_limit=limit,
            cursor=cursor,
            fields=fields,
            include_archived=include_archived,
        )
    )
    return success(TabListDataDTO(tabs=result.tabs), meta=result.meta, warnings=result.warnings)


@router.post("", response_model=SuccessResponseDTO[TabCreateDataDTO])
async def create_tabs(
    body: TabBatchCreateDTO,
    response: Response,
    request: Request,
    service: Annotated[TabService, Depends(get_tab_service)],
    atomic: bool = False,
) -> SuccessResponseDTO[TabCreateDataDTO]:
    """Create one or more tabs."""
    data, status_code = await service.create_batch(body, atomic)
    response.status_code = status_code
    request.app.state.worker.wake()
    return success(
        TabCreateDataDTO(created=data.created, skipped=data.skipped),
        meta=TabCreateMetaDTO(jobs=data.jobs),
        errors=data.errors or None,
    )


@router.post(
    "/batch-delete",
    response_model=SuccessResponseDTO[TabBatchDeleteResultDTO],
)
async def batch_delete(
    body: BatchDeleteDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabBatchDeleteResultDTO]:
    """Archive or permanently delete multiple tabs."""
    return success(await service.batch_delete(body.ids, body.hard))


@router.post(
    "/restore",
    response_model=SuccessResponseDTO[TabRestoreResultDTO],
)
async def restore_tabs(
    body: list[TabRestoreDTO], service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabRestoreResultDTO]:
    """Restore synchronized tabs."""
    return success(await service.restore(body))


@router.get("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def get_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Get one tab."""
    return success(await service.get(tab_id))


@router.patch("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def update_tab(
    tab_id: str, body: TabUpdateDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Update one tab."""
    return success(await service.update(tab_id, body))


@router.delete(
    "/{tab_id}",
    response_model=SuccessResponseDTO[TabDeleteResultDTO],
)
async def delete_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)], hard: bool = False
) -> SuccessResponseDTO[TabDeleteResultDTO]:
    """Archive or permanently delete one tab."""
    return success(await service.delete(tab_id, hard))


@router.post("/{tab_id}/move", response_model=SuccessResponseDTO[TabDTO])
async def move_tab(
    tab_id: str, body: TabMoveDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Move one tab."""
    return success(await service.move(tab_id, body))


@router.post("/{tab_id}/tags", response_model=SuccessResponseDTO[TabDTO])
async def tag_tab(
    tab_id: str, body: TabTagDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Attach a tag to one tab."""
    tab, warnings = await service.tag(tab_id, body.tag_name, True)
    return success(tab, warnings=warnings)


@router.delete(
    "/{tab_id}/tags/{tag_name}",
    response_model=SuccessResponseDTO[TabDTO],
)
async def untag_tab(
    tab_id: str, tag_name: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Detach a tag from one tab."""
    tab, warnings = await service.tag(tab_id, tag_name, False)
    return success(tab, warnings=warnings)
