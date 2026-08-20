from fastapi import APIRouter

from domain.groups.controller import router as groups_router
from domain.system.controller import router as system_router
from domain.tabs.controller import router as tabs_router
from domain.tags.controller import router as tags_router

api_router = APIRouter()
api_router.include_router(tabs_router)
api_router.include_router(groups_router)
api_router.include_router(tags_router)
api_router.include_router(system_router)
