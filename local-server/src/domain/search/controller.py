"""Keyword, semantic, and structured search routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.routes.service_dependencies import get_search_service
from lib.responses import SuccessResponseDTO, success

from .dto import SearchDataDTO, SearchMode, StructuredSearchDTO
from .service import SearchService

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SuccessResponseDTO[SearchDataDTO])
async def search(
    service: Annotated[SearchService, Depends(get_search_service)],
    q: str = Query(min_length=1),
    mode: SearchMode = "hybrid",
    limit: int = Query(10, ge=1, le=50),
    group_id: str | None = Query(None, alias="groupId"),
    tags: str = "",
    min_score: float = Query(0.3, ge=0, le=1, alias="minScore"),
) -> SuccessResponseDTO[SearchDataDTO]:
    """Search tabs using query-string filters.

    Args:
        service (Annotated[SearchService, Depends(get_search_service)]): Request-scoped service
            for this use case.
        q (str): Search text supplied by the caller.
        mode (SearchMode): Selected search or import mode.
        limit (int): Maximum number of results to return.
        group_id (str | None): Collection ID or null for Unassigned.
        tags (str): Tag filters or associations for the operation.
        min_score (float): Lowest semantic similarity score accepted.

    Returns:
        SuccessResponseDTO[SearchDataDTO]: Response envelope containing the search data.
    """
    result = await service.search(
        q, mode, limit, group_id, [tag for tag in tags.split(",") if tag], min_score
    )
    return success(
        SearchDataDTO(results=result.results), meta=result.meta, warnings=result.warnings
    )


@router.post("/search", response_model=SuccessResponseDTO[SearchDataDTO])
async def structured_search(
    body: StructuredSearchDTO,
    service: Annotated[SearchService, Depends(get_search_service)],
) -> SuccessResponseDTO[SearchDataDTO]:
    """Search tabs using typed property predicates.

    Args:
        body (StructuredSearchDTO): Validated HTTP request body.
        service (Annotated[SearchService, Depends(get_search_service)]): Request-scoped service
            for this use case.

    Returns:
        SuccessResponseDTO[SearchDataDTO]: Response envelope containing the search data.
    """
    result = await service.search(
        body.query,
        body.mode,
        body.limit,
        body.group_id,
        body.tags,
        body.min_score,
        body.property_filters,
    )
    return success(
        SearchDataDTO(results=result.results), meta=result.meta, warnings=result.warnings
    )
