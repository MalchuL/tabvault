"""Aggregate all versioned API domain routers."""

from fastapi import APIRouter

from api.routes.backups import router as backups_router
from domain.custom_properties.controller import router as custom_properties_router
from domain.groups.controller import router as groups_router
from domain.search.controller import router as search_router
from domain.sync.controller import router as sync_router
from domain.system.controller import router as system_router
from domain.tabs.controller import router as tabs_router
from domain.tags.controller import router as tags_router
from domain.transfer.controller import router as transfer_router

api_router = APIRouter()
api_router.include_router(custom_properties_router)
api_router.include_router(tabs_router)
api_router.include_router(groups_router)
api_router.include_router(tags_router)
api_router.include_router(system_router)
api_router.include_router(search_router)
api_router.include_router(transfer_router)
api_router.include_router(backups_router)


api_router.include_router(sync_router)
