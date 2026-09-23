"""HTTP routes for server metadata and library health."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from api.routes.service_dependencies import get_system_service
from lib.responses import SuccessResponseDTO, success

from .dto import CapabilitiesDTO, HealthDTO
from .service import SystemService

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthDTO)
async def health(service: Annotated[SystemService, Depends(get_system_service)]) -> HealthDTO:
    """Return process, storage, and vector-index health.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped system
            service used to assemble health state.

    Returns:
        HealthDTO: Current health and visible library counts.
    """
    return await service.health()


@router.get("/capabilities", response_model=SuccessResponseDTO[CapabilitiesDTO])
async def capabilities(
    service: Annotated[SystemService, Depends(get_system_service)],
) -> SuccessResponseDTO[CapabilitiesDTO]:
    """Return optional search capabilities and actionable failures.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped system
            service used to probe runtime features.

    Returns:
        SuccessResponseDTO[CapabilitiesDTO]: Stable capability envelope.
    """
    return success(await service.capabilities())


@router.get("/schema")
async def schema(service: Annotated[SystemService, Depends(get_system_service)]) -> dict[str, Any]:
    """Return the portable-document JSON schema.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped service
            exposing the bundled schema document.

    Returns:
        dict[str, Any]: Portable schema content.
    """
    return service.schema()


@router.get("/errors")
async def errors(service: Annotated[SystemService, Depends(get_system_service)]) -> dict[str, Any]:
    """Return the stable API error catalog.

    Args:
        service (Annotated[SystemService, Depends(get_system_service)]): Request-scoped service
            exposing the bundled error catalog.

    Returns:
        dict[str, Any]: Error catalog content.
    """
    return service.errors()
