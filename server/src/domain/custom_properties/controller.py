"""HTTP routes for Custom Property Schema use cases."""

from typing import Annotated

from fastapi import APIRouter, Depends

from api.routes.service_dependencies import get_custom_property_service
from lib.responses import SuccessResponseDTO, success

from .dto import PropertyDefinitionDTO, PropertyRepairDTO, PropertySchemaDTO, PropertyValidationDTO
from .service import CustomPropertyService

router = APIRouter(prefix="/property-schema", tags=["custom-properties"])


@router.get("", response_model=SuccessResponseDTO[PropertySchemaDTO])
async def get_property_schema(
    service: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SuccessResponseDTO[PropertySchemaDTO]:
    """Return the singleton schema without creating database state.

    Args:
        service (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Request-scoped Custom Property service.

    Returns:
        SuccessResponseDTO[PropertySchemaDTO]: Current schema, possibly empty.
    """
    return success(await service.get())


@router.post("", response_model=SuccessResponseDTO[PropertySchemaDTO])
async def upsert_property_definition(
    body: PropertyDefinitionDTO,
    service: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SuccessResponseDTO[PropertySchemaDTO]:
    """Create or replace one complete property definition by name.

    Args:
        body (PropertyDefinitionDTO): Validated complete definition.
        service (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Request-scoped service owning the transaction.

    Returns:
        SuccessResponseDTO[PropertySchemaDTO]: Complete updated schema.
    """
    return success(await service.upsert(body))


@router.delete("/{property_name}", response_model=SuccessResponseDTO[PropertySchemaDTO])
async def delete_property_definition(
    property_name: str,
    service: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SuccessResponseDTO[PropertySchemaDTO]:
    """Remove one definition while retaining hidden raw values until repair.

    Args:
        property_name (str): Stable case-sensitive definition identity.
        service (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Request-scoped service owning the transaction.

    Returns:
        SuccessResponseDTO[PropertySchemaDTO]: Complete updated schema.
    """
    return success(await service.delete(property_name))


@router.get("/validation", response_model=SuccessResponseDTO[PropertyValidationDTO])
async def validate_property_values(
    service: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SuccessResponseDTO[PropertyValidationDTO]:
    """Scan every Saved Tab for invalid and undeclared raw property values.

    Args:
        service (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Request-scoped validation service.

    Returns:
        SuccessResponseDTO[PropertyValidationDTO]: Read-only full-library validation result.
    """
    return success(await service.validation())


@router.post("/repair", response_model=SuccessResponseDTO[PropertyRepairDTO])
async def repair_property_values(
    service: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SuccessResponseDTO[PropertyRepairDTO]:
    """Convert or remove incompatible values in one explicit atomic repair.

    Args:
        service (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Request-scoped repair service owning the transaction.

    Returns:
        SuccessResponseDTO[PropertyRepairDTO]: Counts for converted, removed, and retained values.
    """
    return success(await service.repair())
