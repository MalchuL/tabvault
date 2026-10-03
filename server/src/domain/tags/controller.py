"""HTTP routes for tag use cases."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from api.routes.service_dependencies import get_tag_service
from lib.pagination import MAX_LIST_PAGE_SIZE, ListOptions
from lib.responses import SuccessResponseDTO, success

from .dto import TagDeleteResultDTO, TagDTO, TagListResponseDTO, TagUpsertDTO
from .service import TagService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=TagListResponseDTO)
async def list_tags(
    service: Annotated[TagService, Depends(get_tag_service)],
    limit: int = Query(MAX_LIST_PAGE_SIZE, ge=1, le=MAX_LIST_PAGE_SIZE),
    offset: int = Query(0, ge=0),
) -> TagListResponseDTO:
    """List tags with usage counts.

    Args:
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.
        limit (int): Maximum number of matching records to return.
        offset (int): Number of matching rows to skip before this page.

    Returns:
        TagListResponseDTO: Page of tags and their visible active-tab counts.
    """
    return await service.list(ListOptions(limit=limit, offset=offset))


@router.get("/export.md", response_class=PlainTextResponse)
async def export_tags(service: Annotated[TagService, Depends(get_tag_service)]) -> str:
    """Export tags as Markdown.

    Args:
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        str: Markdown list of tags and descriptions.
    """
    return await service.markdown()


@router.put("/{name}", response_model=SuccessResponseDTO[TagDTO])
async def upsert_tag(
    name: str, body: TagUpsertDTO, service: Annotated[TagService, Depends(get_tag_service)]
) -> SuccessResponseDTO[TagDTO]:
    """Create or update a tag.

    Args:
        name (str): Human-readable name used by the operation.
        body (TagUpsertDTO): Validated request body supplied by the caller.
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TagDTO]: Envelope containing the created or updated tag.
    """
    return success(await service.upsert(name, body))


@router.delete(
    "/{name}",
    response_model=SuccessResponseDTO[TagDeleteResultDTO],
)
async def delete_tag(
    name: str,
    service: Annotated[TagService, Depends(get_tag_service)],
    detach_from_tabs: bool = Query(False, alias="detachFromTabs"),
) -> SuccessResponseDTO[TagDeleteResultDTO]:
    """Delete a tag.

    Args:
        name (str): Human-readable name used by the operation.
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.
        detach_from_tabs (bool): Whether to remove this tag from associated tabs.

    Returns:
        SuccessResponseDTO[TagDeleteResultDTO]: Envelope containing the deleted tag name and detach count.
    """
    return success(await service.delete(name, detach_from_tabs))
