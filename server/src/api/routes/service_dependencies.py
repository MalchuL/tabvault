"""Central dependency wiring for API application services."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.session import get_async_session
from domain.custom_properties.repository import CustomPropertyRepository
from domain.custom_properties.service import CustomPropertyService
from domain.groups.repository import GroupRepository
from domain.groups.service import GroupService
from domain.search.repository import SearchRepository
from domain.search.service import SearchService
from domain.system.repository import SystemRepository
from domain.system.service import SystemService
from domain.tabs.repository import TabRepository
from domain.tabs.service import TabService
from domain.tags.repository import TagRepository
from domain.tags.service import TagService
from domain.transfer.repository import TransferRepository
from domain.transfer.service import TransferService

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

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.

    Returns:
        TabService: Tab service bound to the current database session.
    """
    return TabService(
        db,
        TabRepository(db),
        CustomPropertyService(db, CustomPropertyRepository(db)),
    )


def get_group_service(db: SessionDep) -> GroupService:
    """Build a request-scoped group service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.

    Returns:
        GroupService: Group service bound to the current database session.
    """
    return GroupService(db, GroupRepository(db))


def get_tag_service(db: SessionDep) -> TagService:
    """Build a request-scoped tag service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.

    Returns:
        TagService: Tag service bound to the current database session.
    """
    return TagService(db, TagRepository(db))


def get_transfer_service(db: SessionDep, settings: SettingsDep) -> TransferService:
    """Build a request-scoped transfer service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.
        settings (SettingsDep): Validated process settings that control this component.

    Returns:
        TransferService: Transfer service bound to the current database session.
    """
    return TransferService(db, settings, TransferRepository(db))


def get_search_service(
    db: SessionDep,
    custom_properties: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SearchService:
    """Build the request-scoped search service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.
        custom_properties (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Service that validates library custom properties.

    Returns:
        SearchService: Search service bound to the current repository and property
            schema.
    """
    return SearchService(SearchRepository(db), custom_properties)


def get_system_service(
    db: SessionDep,
) -> SystemService:
    """Build the request-scoped system metadata service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.

    Returns:
        SystemService: System service bound to this request's repository.
    """
    return SystemService(SystemRepository(db))
