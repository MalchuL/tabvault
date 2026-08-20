from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from api.routes.service_dependencies import get_group_service, get_tab_service
from domain.tabs.service import TabService
from lib.responses import success

from .dto import GroupCreateDTO, GroupUpdateDTO
from .service import GroupService

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("")
async def list_groups(
    service: Annotated[GroupService, Depends(get_group_service)],
    flat: bool = False,
    include_descendant_count: bool = Query(False, alias="includeDescendantCount"),
) -> dict:
    return success({"groups": await service.list(flat, include_descendant_count)})


@router.post("", status_code=201)
async def create_group(
    body: GroupCreateDTO, service: Annotated[GroupService, Depends(get_group_service)]
) -> dict:
    return success(await service.create(body))


@router.patch("/{group_id}")
async def update_group(
    group_id: str,
    body: GroupUpdateDTO,
    service: Annotated[GroupService, Depends(get_group_service)],
) -> dict:
    return success(await service.update(group_id, body))


@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    strategy: Literal["cascade", "promote", "reject_if_nonempty"],
    service: Annotated[GroupService, Depends(get_group_service)],
) -> dict:
    return success(await service.delete(group_id, strategy))


@router.get("/{group_id}/tabs")
async def group_tabs(
    group_id: str,
    tabs: Annotated[TabService, Depends(get_tab_service)],
    groups: Annotated[GroupService, Depends(get_group_service)],
    include_subgroups: bool = Query(False, alias="includeSubgroups"),
    limit: int = Query(50, ge=1),
    cursor: str | None = None,
    fields: str = "full",
) -> dict:
    group_ids = await groups.descendants(group_id) if include_subgroups else {group_id}
    result = await tabs.list(
        group_id="all",
        group_ids=group_ids,
        tags_any=[],
        tags_all=[],
        sort_by="position",
        sort_dir="asc",
        limit=limit,
        requested_limit=limit,
        cursor=cursor,
        fields=fields,
        include_archived=False,
    )
    return success({"tabs": result["tabs"]}, meta=result["meta"], warnings=result["warnings"])
