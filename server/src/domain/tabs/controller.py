"""HTTP routes for Saved Tab use cases."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.routes.service_dependencies import get_tab_service
from domain.custom_properties.dto import CustomPropertiesPatchDTO, CustomPropertiesUnsetDTO
from lib.pagination import ListOptions
from lib.responses import SuccessResponseDTO, success

from .dto import (
    SortDirection,
    TabBatchCreateDTO,
    TabCreateDTO,
    TabDeleteResultDTO,
    TabDTO,
    TabListOptionsDTO,
    TabListOptionsFiltersDTO,
    TabListOptionsOrderingDTO,
    TabListResponseDTO,
    TabReorderDTO,
    TabReorderResultDTO,
    TabSortBy,
    TabTagDTO,
    TabUpdateDTO,
)
from .service import TabService
from .visibility import TabVisibility

router = APIRouter(prefix="/tabs", tags=["tabs"])


class TabFilterQuery(BaseModel):
    """Flat HTTP filters parsed together without changing query parameter names."""

    groupId: str = "all"
    category: str | None = None
    tags: str = ""
    tagsAll: str = ""
    search: str | None = None
    visibility: TabVisibility = "visible"


class TabOrderingQuery(BaseModel):
    """Flat HTTP sorting parameters."""

    sortBy: TabSortBy = "position"
    sortDir: SortDirection = "asc"


@router.get("", response_model=TabListResponseDTO, response_model_exclude_unset=True)
async def list_tabs(
    service: Annotated[TabService, Depends(get_tab_service)],
    filters: Annotated[TabFilterQuery, Depends()],
    ordering: Annotated[TabOrderingQuery, Depends()],
    pagination: Annotated[ListOptions, Depends()],
    fields: str = "full",
) -> TabListResponseDTO:
    """List Saved Tabs with grouped filters, sorting, and pagination.

    Args:
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped tab service.
        filters (Annotated[TabFilterQuery, Depends()]): Collection, tags, search, and visibility.
        ordering (Annotated[TabOrderingQuery, Depends()]): Sort field and direction.
        pagination (Annotated[ListOptions, Depends()]): Validated limit and offset.
        fields (str): Full, minimal, or comma-separated nested projection paths.

    Returns:
        TabListResponseDTO: Matching records with pagination metadata.
    """
    return await service.list(
        TabListOptionsDTO(
            fields=fields,
            filters=TabListOptionsFiltersDTO(
                group_id=filters.groupId,
                category=filters.category,
                tags_any=[value for value in filters.tags.split(",") if value],
                tags_all=[value for value in filters.tagsAll.split(",") if value],
                search=filters.search,
                visibility=filters.visibility,
            ),
            ordering=TabListOptionsOrderingDTO(sort_by=ordering.sortBy, sort_dir=ordering.sortDir),
        ),
        pagination,
    )


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
    return success(await service.create(body))


@router.post("/batch", status_code=201, response_model=SuccessResponseDTO[list[TabDTO]])
async def create_tabs_batch(
    body: TabBatchCreateDTO,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[list[TabDTO]]:
    """Create multiple Saved Tab occurrences atomically.

    This specialized browser-capture boundary validates a bounded camelCase batch, delegates one
    transaction to the Saved Tab service. The ordinary ``POST /tabs`` endpoint remains the single-occurrence command.

    Args:
        body (TabBatchCreateDTO): One Session's occurrences in desired display order.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped Saved Tab service
            that owns the atomic transaction.

    Returns:
        SuccessResponseDTO[list[TabDTO]]: Created occurrences in submitted order.
    """
    return success(await service.create_batch(body))


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


@router.delete(
    "/{tab_id}/custom-properties/{property_name:path}", response_model=SuccessResponseDTO[TabDTO]
)
async def delete_tab_custom_property(
    tab_id: str,
    property_name: str,
    service: Annotated[TabService, Depends(get_tab_service)],
) -> SuccessResponseDTO[TabDTO]:
    """Remove one keyed override while retaining its definition and other tabs.

    Args:
        tab_id (str): Stable Saved Tab identity; missing tabs raise the existing not-found error.
        property_name (str): Case-sensitive stored key to remove idempotently.
        service (Annotated[TabService, Depends(get_tab_service)]): Request-scoped tab service.

    Returns:
        SuccessResponseDTO[TabDTO]: Updated tab with schema defaults resolved for absent values.
    """
    return success(await service.unset_custom_properties(tab_id, [property_name]))


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
