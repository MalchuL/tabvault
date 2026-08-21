"""Central dependency wiring for API application services."""

from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.session import get_async_session
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


def get_tab_service(db: SessionDep) -> TabService:
    """Build a request-scoped tab service."""
    return TabService(db, TabRepository(db))


def get_group_service(db: SessionDep) -> GroupService:
    """Build a request-scoped group service."""
    return GroupService(db, GroupRepository(db))


def get_tag_service(db: SessionDep) -> TagService:
    """Build a request-scoped tag service."""
    return TagService(db, TagRepository(db))


def get_vector_index(request: Request) -> LocalVectorIndex:
    """Return the process-wide local vector index."""
    return cast(LocalVectorIndex, request.app.state.vectors)


def get_transfer_service(db: SessionDep, settings: SettingsDep) -> TransferService:
    """Build a request-scoped transfer service."""
    return TransferService(db, settings, SystemRepository(db))


def get_system_service(
    db: SessionDep,
    settings: SettingsDep,
    vectors: Annotated[LocalVectorIndex, Depends(get_vector_index)],
    transfer: Annotated[TransferService, Depends(get_transfer_service)],
) -> SystemService:
    """Build a request-scoped system service."""
    return SystemService(db, settings, vectors, SystemRepository(db), transfer)
