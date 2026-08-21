"""HTTP routes for group use cases."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.routes.service_dependencies import get_group_service, get_tab_service
from domain.tabs.dto import TabListDataDTO, TabListOptionsDTO
from domain.tabs.service import TabService
from lib.responses import SuccessResponseDTO, success

from .dto import (
    GroupCreateDTO,
    GroupDeleteResultDTO,
    GroupDeleteStrategy,
    GroupDTO,
    GroupListDataDTO,
    GroupUpdateDTO,
)
from .service import GroupService

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=SuccessResponseDTO[GroupListDataDTO])
async def list_groups(
    service: Annotated[GroupService, Depends(get_group_service)],
    flat: bool = False,
    include_descendant_count: bool = Query(False, alias="includeDescendantCount"),
) -> SuccessResponseDTO[GroupListDataDTO]:
    """List active groups as a flat sequence or tree."""
    return success(GroupListDataDTO(groups=await service.list(flat, include_descendant_count)))


@router.post(
    "",
    status_code=201,
    response_model=SuccessResponseDTO[GroupDTO],
)
async def create_group(
    body: GroupCreateDTO, service: Annotated[GroupService, Depends(get_group_service)]
) -> SuccessResponseDTO[GroupDTO]:
    """Create a group."""
    return success(await service.create(body))


@router.patch("/{group_id}", response_model=SuccessResponseDTO[GroupDTO])
async def update_group(
    group_id: str,
    body: GroupUpdateDTO,
    service: Annotated[GroupService, Depends(get_group_service)],
) -> SuccessResponseDTO[GroupDTO]:
    """Update a group."""
    return success(await service.update(group_id, body))


@router.delete(
    "/{group_id}",
    response_model=SuccessResponseDTO[GroupDeleteResultDTO],
)
async def delete_group(
    group_id: str,
    strategy: GroupDeleteStrategy,
    service: Annotated[GroupService, Depends(get_group_service)],
) -> SuccessResponseDTO[GroupDeleteResultDTO]:
    """Delete a group using the selected strategy."""
    return success(await service.delete(group_id, strategy))


@router.get(
    "/{group_id}/tabs",
    response_model=SuccessResponseDTO[TabListDataDTO],
    response_model_exclude_unset=True,
)
async def group_tabs(
    group_id: str,
    tabs: Annotated[TabService, Depends(get_tab_service)],
    groups: Annotated[GroupService, Depends(get_group_service)],
    include_subgroups: bool = Query(False, alias="includeSubgroups"),
    limit: int = Query(50, ge=1),
    cursor: str | None = None,
    fields: str = "full",
) -> SuccessResponseDTO[TabListDataDTO]:
    """List tabs assigned to a group and optional descendants."""
    group_ids = await groups.descendants(group_id) if include_subgroups else {group_id}
    result = await tabs.list(
        TabListOptionsDTO(
            group_id="all",
            group_ids=group_ids,
            sort_by="position",
            sort_dir="asc",
            limit=limit,
            requested_limit=limit,
            cursor=cursor,
            fields=fields,
            include_archived=False,
        )
    )
    return success(TabListDataDTO(tabs=result.tabs), meta=result.meta, warnings=result.warnings)
