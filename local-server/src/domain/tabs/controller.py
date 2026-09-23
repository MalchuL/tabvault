"""HTTP routes for Saved Tab use cases."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from api.routes.service_dependencies import get_tab_service
from domain.custom_properties.dto import CustomPropertiesPatchDTO, CustomPropertiesUnsetDTO
from lib.pagination import MAX_LIST_PAGE_SIZE, ListOptions
from lib.responses import SuccessResponseDTO, success

from .dto import (
    TabBatchCreateDTO,
    TabBatchCreateMetaDTO,
    TabCreateDTO,
    TabCreateMetaDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabListOptionsDTO,
    TabListResponseDTO,
    TabReorderDTO,
    TabReorderResultDTO,
    TabTagDTO,
    TabUpdateDTO,
)
from .service import TabService
from .visibility import TabVisibility

router = APIRouter(prefix="/tabs", tags=["tabs"])


@router.get("", response_model=TabListResponseDTO, response_model_exclude_unset=True)
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
    limit: int = Query(MAX_LIST_PAGE_SIZE, ge=1, le=MAX_LIST_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    fields: str = "full",
    visibility: TabVisibility = "visible",
) -> TabListResponseDTO:
    """List Saved Tabs using filters and offset pagination.

    Args:
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.
        group_id (str): Stable identifier of the group targeted by the operation.
        category (str | None): Optional free-form Group category used to restrict results.
        tags (str): Tags associated with the saved tab.
        tags_all (str): Tag names all matching tabs must contain.
        search (str | None): Optional case-insensitive text query.
        sort_by (Literal["position", "createdAt", "updatedAt", "title"]): Sort by value consumed by
            this operation.
        sort_dir (Literal["asc", "desc"]): Directory used to store sort data.
        limit (int): Maximum number of matching records to return.
        offset (int): Number of matching rows to skip before this page.
        fields (str): Requested response projection controlling which fields are serialized.
        visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.

    Returns:
        TabListResponseDTO: Page of tabs matching the supplied filters and projection.
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
            fields=fields,
            visibility=visibility,
        ),
        ListOptions(limit=limit, offset=offset),
    )
    return result


@router.put("/order", response_model=SuccessResponseDTO[TabReorderResultDTO])
async def reorder_tabs(
    body: TabReorderDTO,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[TabReorderResultDTO]:
    """Reorder active Saved Tabs within one Group or Unassigned atomically.

    This HTTP boundary validates the camelCase request body and delegates the single-transaction
    batch to the Saved Tab service. It replaces clients issuing one position PATCH per tab.

    Args:
        body (TabReorderDTO): Membership scope and unique tab IDs from first to last.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped Saved Tab service
            that validates membership and owns the transaction.

    Returns:
        SuccessResponseDTO[TabReorderResultDTO]: Accepted scope and ordered IDs.
    """
    return success(await service.reorder(body))


@router.post("", status_code=201, response_model=SuccessResponseDTO[TabDTO])
async def create_tab(
    body: TabCreateDTO,
    request: Request,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[TabDTO]:
    """Create exactly one Saved Tab occurrence.

    Args:
        body (TabCreateDTO): Validated request body supplied by the caller.
        request (Request): Incoming FastAPI request, including its headers and body.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Envelope containing the new saved-tab occurrence.
    """
    tab, job = await service.create(body)
    request.app.state.worker.wake()
    return success(tab, meta=TabCreateMetaDTO(job=job))


@router.post("/batch", status_code=201, response_model=SuccessResponseDTO[list[TabDTO]])
async def create_tabs_batch(
    body: TabBatchCreateDTO,
    request: Request,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[list[TabDTO]]:
    """Create multiple Saved Tab occurrences atomically.

    This specialized browser-capture boundary validates a bounded camelCase batch, delegates one
    transaction to the Saved Tab service, and wakes the preview worker only after the transaction
    commits. The ordinary ``POST /tabs`` endpoint remains the single-occurrence command.

    Args:
        body (TabBatchCreateDTO): One Session's occurrences in desired display order.
        request (Request): Incoming request whose application state owns the preview worker.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped Saved Tab service
            that owns the atomic transaction.

    Returns:
        SuccessResponseDTO[list[TabDTO]]: Created occurrences with preview-job metadata.
    """
    tabs, jobs = await service.create_batch(body)
    request.app.state.worker.wake()
    return success(tabs, meta=TabBatchCreateMetaDTO(jobs=jobs))


@router.get("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def get_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Get one Saved Tab.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Envelope containing the requested saved tab.
    """
    return success(await service.get(tab_id))


@router.patch("/{tab_id}", response_model=SuccessResponseDTO[TabDTO])
async def update_tab(
    tab_id: str, body: TabUpdateDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Patch one Saved Tab, including move or restore state.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        body (TabUpdateDTO): Validated request body supplied by the caller.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Envelope containing the patched saved tab.
    """
    return success(await service.update(tab_id, body))


@router.patch("/{tab_id}/custom-properties", response_model=SuccessResponseDTO[TabDTO])
async def patch_tab_custom_properties(
    tab_id: str,
    body: CustomPropertiesPatchDTO,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[TabDTO]:
    """Atomically merge only the supplied schema-defined property values.

    Args:
        tab_id (str): Stable identity of the Saved Tab to update.
        body (CustomPropertiesPatchDTO): Dynamic property subset supplied as the request object.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped tab service.

    Returns:
        SuccessResponseDTO[TabDTO]: Updated Saved Tab with resolved declared properties.
    """
    return success(await service.patch_custom_properties(tab_id, body.root))


@router.post("/{tab_id}/custom-properties/unset", response_model=SuccessResponseDTO[TabDTO])
async def unset_tab_custom_properties(
    tab_id: str,
    body: CustomPropertiesUnsetDTO,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[TabDTO]:
    """Remove selected explicit overrides so schema defaults apply again.

    Args:
        tab_id (str): Stable identity of the Saved Tab to update.
        body (CustomPropertiesUnsetDTO): Unique property names to remove atomically.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped tab service.

    Returns:
        SuccessResponseDTO[TabDTO]: Updated Saved Tab with defaults resolved for removed names.
    """
    return success(await service.unset_custom_properties(tab_id, body.properties))


@router.delete("/{tab_id}", response_model=SuccessResponseDTO[TabDeleteResultDTO])
async def delete_tab(
    tab_id: str, service: Annotated[TabService, Depends(get_tab_service)], hard: bool = False
) -> SuccessResponseDTO[TabDeleteResultDTO]:
    """Archive or permanently delete one Saved Tab.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.
        hard (bool): Whether to permanently delete an already archived record instead of archiving
            it.

    Returns:
        SuccessResponseDTO[TabDeleteResultDTO]: Envelope containing the tab ID and archive or deletion state.
    """
    return success(await service.delete(tab_id, hard))


@router.post("/{tab_id}/tags", response_model=SuccessResponseDTO[TabDTO])
async def tag_tab(
    tab_id: str, body: TabTagDTO, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Attach one tag to one Saved Tab.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        body (TabTagDTO): Validated request body supplied by the caller.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Envelope containing the tab with its newly attached tag.
    """
    tab, warnings = await service.tag(tab_id, body.tag_name, True)
    return success(tab, warnings=warnings)


@router.delete("/{tab_id}/tags/{tag_name}", response_model=SuccessResponseDTO[TabDTO])
async def untag_tab(
    tab_id: str, tag_name: str, service: Annotated[TabService, Depends(get_tab_service)]
) -> SuccessResponseDTO[TabDTO]:
    """Detach one tag from one Saved Tab.

    Args:
        tab_id (str): Stable identifier of the tab targeted by the operation.
        tag_name (str): Name of the tag to attach or remove.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TabDTO]: Envelope containing the tab without the removed tag.
    """
    tab, warnings = await service.tag(tab_id, tag_name, False)
    return success(tab, warnings=warnings)
