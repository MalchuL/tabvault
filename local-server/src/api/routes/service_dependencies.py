"""Central dependency wiring for API application services."""

from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.session import get_async_session
from domain.custom_properties.repository import CustomPropertyRepository
from domain.custom_properties.service import CustomPropertyService
from domain.groups.repository import GroupRepository
from domain.groups.service import GroupService
from domain.system.repository import SystemRepository
from domain.system.search import LocalVectorIndex
from domain.system.service import SystemService
from domain.system.transfer import TransferService
from domain.tabs.repository import TabRepository
from domain.tabs.service import TabService
from domain.tags.repository import TagRepository
from domain.tags.service import TagService

SessionDep = Annotated[AsyncSession, Depends(get_async_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_custom_property_service(db: SessionDep) -> CustomPropertyService:
    """Build a request-scoped Custom Property service.

    Args:
        db (SessionDep): Request-scoped session shared by schema and tab mutations.

    Returns:
        CustomPropertyService: Service that owns schema and property transaction boundaries.
    """
    return CustomPropertyService(db, CustomPropertyRepository(db))


def get_tab_service(db: SessionDep) -> TabService:
    """Build a request-scoped tab service.

    This application-boundary helper configures or protects the FastAPI process while keeping domain
    use cases in their dedicated services.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.

    Returns:
        TabService: Result produced by the operation described above.
    """
    return TabService(
        db,
        TabRepository(db),
        CustomPropertyService(db, CustomPropertyRepository(db)),
    )


def get_group_service(db: SessionDep) -> GroupService:
    """Build a request-scoped group service.

    This application-boundary helper configures or protects the FastAPI process while keeping domain
    use cases in their dedicated services.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.

    Returns:
        GroupService: Result produced by the operation described above.
    """
    return GroupService(db, GroupRepository(db))


def get_tag_service(db: SessionDep) -> TagService:
    """Build a request-scoped tag service.

    This application-boundary helper configures or protects the FastAPI process while keeping domain
    use cases in their dedicated services.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.

    Returns:
        TagService: Result produced by the operation described above.
    """
    return TagService(db, TagRepository(db))


def get_vector_index(request: Request) -> LocalVectorIndex:
    """Return the process-wide local vector index.

    This application-boundary helper configures or protects the FastAPI process while keeping domain
    use cases in their dedicated services.

    Args:
        request (Request): Incoming FastAPI request, including its headers and body.

    Returns:
        LocalVectorIndex: Result produced by the operation described above.
    """
    return cast(LocalVectorIndex, request.app.state.vectors)


def get_transfer_service(db: SessionDep, settings: SettingsDep) -> TransferService:
    """Build a request-scoped transfer service.

    This application-boundary helper configures or protects the FastAPI process while keeping domain
    use cases in their dedicated services.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.
        settings (SettingsDep): Validated process settings that control this component.

    Returns:
        TransferService: Result produced by the operation described above.
    """
    return TransferService(db, settings, SystemRepository(db))


def get_system_service(
    db: SessionDep,
    settings: SettingsDep,
    vectors: Annotated[LocalVectorIndex, Depends(get_vector_index)],
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
    custom_properties: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SystemService:
    """Build a request-scoped system service.

    This application-boundary helper configures or protects the FastAPI process while keeping domain
    use cases in their dedicated services.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.
        settings (SettingsDep): Validated process settings that control this component.
        vectors (Annotated[LocalVectorIndex, Depends(get_vector_index)]): Vectors value consumed by
            this operation.
        transfer (Annotated[TransferService, Depends(get_transfer_service)]): Transfer value
            consumed by this operation.
        custom_properties (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Request-scoped schema resolver used by search projections.

    Returns:
        SystemService: Result produced by the operation described above.
    """
    return SystemService(db, settings, vectors, SystemRepository(db), transfer, custom_properties)
