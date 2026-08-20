from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from lib.base_repository import BaseRepository
from lib.cursor import Cursor
from models import Tab, Tag


class TabRepository(BaseRepository[Tab]):
    model_type = Tab

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)
        self.session = session

    async def get(self, tab_id: str) -> Tab | None:  # type: ignore[override]
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tab).where(Tab.id == tab_id).options(selectinload(Tab.tags))
        )

    async def find_url(self, normalized_url: str) -> Tab | None:
        return await self.session.scalar(  # type: ignore[no-any-return]
            select(Tab)
            .where(Tab.normalized_url == normalized_url)
            .order_by(Tab.created_at, Tab.id)
            .options(selectinload(Tab.tags))
        )

    async def list_tabs(
        self,
        *,
        group_id: str | None | object,
        group_ids: set[str] | None,
        tags_any: list[str],
        tags_all: list[str],
        search: str | None,
        sort_by: str,
        sort_dir: str,
        limit: int,
        cursor: Cursor | None,
        include_archived: bool,
    ) -> tuple[list[Tab], int]:
        sort_column = {
            "position": Tab.position,
            "createdAt": Tab.created_at,
            "updatedAt": Tab.updated_at,
            "title": func.lower(Tab.title),
        }[sort_by]
        filters: list[Any] = []
        if not include_archived:
            filters.append(Tab.archived.is_(False))
        if group_ids is not None:
            filters.append(Tab.group_id.in_(group_ids))
        elif group_id != "all":
            filters.append(
                Tab.group_id.is_(None) if group_id == "inbox" else Tab.group_id == group_id
            )
        if search:
            pattern = f"%{search.lower()}%"
            filters.append(
                or_(
                    func.lower(Tab.title).like(pattern),
                    func.lower(Tab.url).like(pattern),
                    func.lower(Tab.note).like(pattern),
                )
            )
        for name in tags_all:
            filters.append(Tab.tags.any(func.lower(Tag.name) == name.lower()))
        if tags_any:
            filters.append(
                Tab.tags.any(func.lower(Tag.name).in_([name.lower() for name in tags_any]))
            )
        total = int(await self.session.scalar(select(func.count(Tab.id)).where(*filters)) or 0)
        if cursor:
            cursor_value = cursor.value
            if sort_by in {"createdAt", "updatedAt"} and isinstance(cursor_value, str):
                cursor_value = datetime.fromisoformat(cursor_value.replace("Z", "+00:00"))
            compare = (
                sort_column > cursor_value if sort_dir == "asc" else sort_column < cursor_value
            )
            filters.append(
                or_(
                    compare,
                    and_(
                        sort_column == cursor_value,
                        Tab.id > cursor.id if sort_dir == "asc" else Tab.id < cursor.id,
                    ),
                )
            )
        ordering = asc if sort_dir == "asc" else desc
        rows = list(
            (
                await self.session.scalars(
                    select(Tab)
                    .where(*filters)
                    .options(selectinload(Tab.tags))
                    .order_by(ordering(sort_column), ordering(Tab.id))
                    .limit(limit + 1)
                )
            ).unique()
        )
        return rows, total

    async def group_rows(self, group_id: str | None) -> list[Tab]:
        return list(
            (
                await self.session.scalars(
                    select(Tab)
                    .where(Tab.group_id.is_(None) if group_id is None else Tab.group_id == group_id)
                    .where(Tab.archived.is_(False))
                    .options(selectinload(Tab.tags))
                    .order_by(Tab.position, Tab.id)
                )
            ).unique()
        )
