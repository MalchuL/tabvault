"""HTTP routes for tag use cases."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from api.routes.service_dependencies import get_tag_service
from lib.responses import SuccessResponseDTO, success

from .dto import TagDeleteResultDTO, TagDTO, TagListDataDTO, TagUpsertDTO
from .service import TagService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=SuccessResponseDTO[TagListDataDTO])
async def list_tags(
    service: Annotated[TagService, Depends(get_tag_service)],
) -> SuccessResponseDTO[TagListDataDTO]:
    """List tags with usage counts.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TagListDataDTO]: Result produced by the operation described above.
    """
    return success(TagListDataDTO(tags=await service.list()))


@router.get("/export.md", response_class=PlainTextResponse)
async def export_tags(service: Annotated[TagService, Depends(get_tag_service)]) -> str:
    """Export tags as Markdown.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        str: Result produced by the operation described above.
    """
    return await service.markdown()


@router.put("/{name}", response_model=SuccessResponseDTO[TagDTO])
async def upsert_tag(
    name: str, body: TagUpsertDTO, service: Annotated[TagService, Depends(get_tag_service)]
) -> SuccessResponseDTO[TagDTO]:
    """Create or update a tag.

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        name (str): Human-readable name used by the operation.
        body (TagUpsertDTO): Validated request body supplied by the caller.
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.

    Returns:
        SuccessResponseDTO[TagDTO]: Result produced by the operation described above.
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

    This HTTP-boundary operation relies on FastAPI for input validation and dependency resolution,
    delegates domain work to an injected service, and returns the shared typed response envelope.
    Database access and transaction decisions remain outside the route.

    Args:
        name (str): Human-readable name used by the operation.
        service (Annotated[TagService, Depends(get_tag_service)]): Request-scoped application
            service that implements the use case.
        detach_from_tabs (bool): Detach from tabs value consumed by this operation.

    Returns:
        SuccessResponseDTO[TagDeleteResultDTO]: Result produced by the operation described above.
    """
    return success(await service.delete(name, detach_from_tabs))
