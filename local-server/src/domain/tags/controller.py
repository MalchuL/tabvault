from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from api.routes.service_dependencies import get_tag_service
from lib.responses import success

from .dto import TagUpsertDTO
from .service import TagService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("")
async def list_tags(service: Annotated[TagService, Depends(get_tag_service)]) -> dict:
    return success({"tags": await service.list()})


@router.get("/export.md", response_class=PlainTextResponse)
async def export_tags(service: Annotated[TagService, Depends(get_tag_service)]) -> str:
    return await service.markdown()


@router.put("/{name}")
async def upsert_tag(
    name: str, body: TagUpsertDTO, service: Annotated[TagService, Depends(get_tag_service)]
) -> dict:
    return success(await service.upsert(name, body))


@router.delete("/{name}")
async def delete_tag(
    name: str,
    service: Annotated[TagService, Depends(get_tag_service)],
    detach_from_tabs: bool = Query(False, alias="detachFromTabs"),
) -> dict:
    return success(await service.delete(name, detach_from_tabs))
