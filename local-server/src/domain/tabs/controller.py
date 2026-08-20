from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from api.routes.service_dependencies import get_tab_service
from lib.responses import success

from .dto import BatchDeleteDTO, TabBatchCreateDTO, TabMoveDTO, TabRestoreDTO, TabUpdateDTO
from .service import TabService

router = APIRouter(prefix="/tabs", tags=["tabs"])


@router.get("")
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
) -> dict:
    result = await service.list(
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
    return success({"tabs": result["tabs"]}, meta=result["meta"], warnings=result["warnings"])


@router.post("")
async def create_tabs(
    body: TabBatchCreateDTO,
    response: Response,
    request: Request,
    service: Annotated[TabService, Depends(get_tab_service)],
    atomic: bool = False,
) -> dict:
    data, status_code = await service.create_batch(body, atomic)
    response.status_code = status_code
    request.app.state.worker.wake()
    errors = data.pop("errors")
    result = success(
        {"created": data["created"], "skipped": data["skipped"]}, meta={"jobs": data["jobs"]}
    )
    if errors:
        result["errors"] = errors
    return result


@router.post("/batch-delete")
async def batch_delete(
    body: BatchDeleteDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> dict:
    return success(await service.batch_delete(body.ids, body.hard))


@router.post("/restore")
async def restore_tabs(
    body: list[TabRestoreDTO], service: Annotated[TabService, Depends(get_tab_service)]
) -> dict:
    return success(await service.restore(body))


@router.get("/{tab_id}")
async def get_tab(tab_id: str, service: Annotated[TabService, Depends(get_tab_service)]) -> dict:
    return success(await service.get(tab_id))


@router.patch("/{tab_id}")
async def update_tab(
    tab_id: str, body: TabUpdateDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> dict:
    return success(await service.update(tab_id, body))


@router.delete("/{tab_id}")
async def delete_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)], hard: bool = False
) -> dict:
    return success(await service.delete(tab_id, hard))


@router.post("/{tab_id}/move")
async def move_tab(
    tab_id: str, body: TabMoveDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> dict:
    return success(await service.move(tab_id, body))


@router.post("/{tab_id}/tags")
async def tag_tab(
    tab_id: str, body: dict[str, str], service: Annotated[TabService, Depends(get_tab_service)]
) -> dict:
    tab, warnings = await service.tag(tab_id, body.get("tagName", ""), True)
    return success(tab, warnings=warnings)


@router.delete("/{tab_id}/tags/{tag_name}")
async def untag_tab(
    tab_id: str, tag_name: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> dict:
    tab, warnings = await service.tag(tab_id, tag_name, False)
    return success(tab, warnings=warnings)
