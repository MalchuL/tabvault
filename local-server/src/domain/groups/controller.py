"""HTTP routes for flat Group use cases."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.routes.service_dependencies import get_group_service, get_tab_service
from domain.tabs.dto import TabListDataDTO, TabListOptionsDTO
from domain.tabs.service import TabService
from domain.tabs.visibility import TabVisibility
from lib.responses import SuccessResponseDTO, success

from .dto import GroupCreateDTO, GroupDeleteResultDTO, GroupDTO, GroupListDataDTO, GroupUpdateDTO
from .service import GroupService

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=SuccessResponseDTO[GroupListDataDTO])
async def list_groups(
    service: Annotated[GroupService, Depends(get_group_service)],
    visibility: TabVisibility = "visible",
    category: str | None = None,
) -> SuccessResponseDTO[GroupListDataDTO]:
    """List every flat Group newest first.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[GroupService, Depends(get_group_service)]): Request-scoped application
            service that implements the use case.
        visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.
        category (str | None): Optional free-form Group category used to restrict results.

    Returns:
        SuccessResponseDTO[GroupListDataDTO]: Result produced by the operation described above.
    """
    return success(GroupListDataDTO(groups=await service.list(visibility, category)))


@router.post("", status_code=201, response_model=SuccessResponseDTO[GroupDTO])
async def create_group(
    body: GroupCreateDTO, service: Annotated[GroupService, Depends(get_group_service)]
) -> SuccessResponseDTO[GroupDTO]:
    """Create one Group.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        body (GroupCreateDTO): Validated request body supplied by the caller.
        service (Annotated[GroupService, Depends(get_group_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[GroupDTO]: Result produced by the operation described above.
    """
    return success(await service.create(body))


@router.get("/{group_id}", response_model=SuccessResponseDTO[GroupDTO])
async def get_group(
    group_id: str, service: Annotated[GroupService, Depends(get_group_service)]
) -> SuccessResponseDTO[GroupDTO]:
    """Get one Group.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        group_id (str): Stable identifier of the group targeted by the operation.
        service (Annotated[GroupService, Depends(get_group_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[GroupDTO]: Result produced by the operation described above.
    """
    return success(await service.get(group_id))


@router.patch("/{group_id}", response_model=SuccessResponseDTO[GroupDTO])
async def update_group(
    group_id: str,
    body: GroupUpdateDTO,
    service: Annotated[GroupService, Depends(get_group_service)],
) -> SuccessResponseDTO[GroupDTO]:
    """Patch one Group.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        group_id (str): Stable identifier of the group targeted by the operation.
        body (GroupUpdateDTO): Validated request body supplied by the caller.
        service (Annotated[GroupService, Depends(get_group_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[GroupDTO]: Result produced by the operation described above.
    """
    return success(await service.update(group_id, body))


@router.delete("/{group_id}", response_model=SuccessResponseDTO[GroupDeleteResultDTO])
async def delete_group(
    group_id: str, service: Annotated[GroupService, Depends(get_group_service)]
) -> SuccessResponseDTO[GroupDeleteResultDTO]:
    """Archive and Unassign members, then permanently delete the Group.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        group_id (str): Stable identifier of the group targeted by the operation.
        service (Annotated[GroupService, Depends(get_group_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[GroupDeleteResultDTO]: Result produced by the operation described above.
    """
    return success(await service.delete(group_id))


@router.get(
    "/{group_id}/tabs",
    response_model=SuccessResponseDTO[TabListDataDTO],
    response_model_exclude_unset=True,
)
async def group_tabs(
    group_id: str,
    tabs: Annotated[TabService, Depends(get_tab_service)],
    groups: Annotated[GroupService, Depends(get_group_service)],
    limit: int = Query(50, ge=1),
    cursor: str | None = None,
    fields: str = "full",
    visibility: TabVisibility = "visible",
) -> SuccessResponseDTO[TabListDataDTO]:
    """List active tabs assigned directly to one Group.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        group_id (str): Stable identifier of the group targeted by the operation.
        tabs (Annotated[TabService, Depends(get_tab_service)]): Saved Tab service resolved for the
            current request.
        groups (Annotated[GroupService, Depends(get_group_service)]): Group service resolved for the
            current request.
        limit (int): Maximum number of matching records to return.
        cursor (str | None): Opaque keyset cursor returned by an earlier page, or ``None`` for the
            first page.
        fields (str): Requested response projection controlling which fields are serialized.
        visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.

    Returns:
        SuccessResponseDTO[TabListDataDTO]: Result produced by the operation described above.
    """
    await groups.get(group_id)
    result = await tabs.list(
        TabListOptionsDTO(
            group_id=group_id,
            sort_by="position",
            sort_dir="asc",
            limit=limit,
            requested_limit=limit,
            cursor=cursor,
            fields=fields,
            visibility=visibility,
        )
    )
    return success(TabListDataDTO(tabs=result.tabs), meta=result.meta, warnings=result.warnings)
