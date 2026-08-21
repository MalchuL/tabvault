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
    """List tags with usage counts."""
    return success(TagListDataDTO(tags=await service.list()))


@router.get("/export.md", response_class=PlainTextResponse)
async def export_tags(service: Annotated[TagService, Depends(get_tag_service)]) -> str:
    """Export tags as Markdown."""
    return await service.markdown()


@router.put("/{name}", response_model=SuccessResponseDTO[TagDTO])
async def upsert_tag(
    name: str, body: TagUpsertDTO, service: Annotated[TagService, Depends(get_tag_service)]
) -> SuccessResponseDTO[TagDTO]:
    """Create or update a tag."""
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
    """Delete a tag."""
    return success(await service.delete(name, detach_from_tabs))
