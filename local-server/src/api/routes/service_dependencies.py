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
from domain.indexing.repository import IndexingRepository
from domain.indexing.service import IndexingService
from domain.indexing.vector_index import LocalVectorIndex
from domain.jobs.repository import JobRepository
from domain.jobs.service import JobService
from domain.previews.query_service import PreviewQueryService
from domain.previews.repository import PreviewRepository
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


def get_vector_index(request: Request) -> LocalVectorIndex:
    """Return the process-wide local vector index.

    Args:
        request (Request): Incoming FastAPI request, including its headers and body.

    Returns:
        LocalVectorIndex: Shared index instance used by search requests.
    """
    return cast(LocalVectorIndex, request.app.state.vectors)


def get_transfer_service(db: SessionDep, settings: SettingsDep) -> TransferService:
    """Build a request-scoped transfer service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session used by this operation.
        settings (SettingsDep): Validated process settings that control this component.

    Returns:
        TransferService: Transfer service bound to the current database session.
    """
    return TransferService(db, settings, TransferRepository(db), JobRepository(db))


def get_search_service(
    db: SessionDep,
    vectors: Annotated[LocalVectorIndex, Depends(get_vector_index)],
    custom_properties: Annotated[CustomPropertyService, Depends(get_custom_property_service)],
) -> SearchService:
    """Build the request-scoped search service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.
        vectors (Annotated[LocalVectorIndex, Depends(get_vector_index)]): Vector index used for
            semantic search.
        custom_properties (Annotated[CustomPropertyService, Depends(get_custom_property_service)]):
            Service that validates library custom properties.

    Returns:
        SearchService: Search service bound to the current repository, vector index, and property
            schema.
    """
    return SearchService(vectors, SearchRepository(db), custom_properties)


def get_indexing_service(
    db: SessionDep,
    vectors: Annotated[LocalVectorIndex, Depends(get_vector_index)],
) -> IndexingService:
    """Build the request-scoped indexing service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.
        vectors (Annotated[LocalVectorIndex, Depends(get_vector_index)]): Vector index used for
            semantic search.

    Returns:
        IndexingService: Indexing service bound to this request's repository and vector index.
    """
    return IndexingService(db, vectors, IndexingRepository(db), JobRepository(db))


def get_job_service(db: SessionDep) -> JobService:
    """Build the request-scoped durable-job service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.

    Returns:
        JobService: Job service bound to this request's repository.
    """
    return JobService(JobRepository(db))


def get_preview_service(db: SessionDep, settings: SettingsDep) -> PreviewQueryService:
    """Build the request-scoped preview query service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.
        settings (SettingsDep): Validated runtime settings for this operation.

    Returns:
        PreviewQueryService: Preview query service bound to this request's session and settings.
    """
    return PreviewQueryService(db, settings, PreviewRepository(db), JobRepository(db))


def get_system_service(
    db: SessionDep,
    vectors: Annotated[LocalVectorIndex, Depends(get_vector_index)],
) -> SystemService:
    """Build the request-scoped system metadata service.

    Args:
        db (SessionDep): Request-scoped asynchronous database session.
        vectors (Annotated[LocalVectorIndex, Depends(get_vector_index)]): Vector index used for
            semantic search.

    Returns:
        SystemService: System service bound to this request's repository and vector index.
    """
    return SystemService(vectors, SystemRepository(db))
