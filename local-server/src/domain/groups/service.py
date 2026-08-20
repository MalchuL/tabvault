from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lib.time import utc_now
from models import Group, Tab, Tombstone

from .dto import GroupCreateDTO, GroupUpdateDTO
from .error import GroupCycleError, GroupNotEmptyError, GroupNotFoundError
from .mapper import GroupMapper
from .repository import GroupRepository


class GroupService:
    def __init__(self, db: AsyncSession, repository: GroupRepository) -> None:
        self.db = db
        self.repository = repository
        self.mapper = GroupMapper()

    async def _validate_parent(self, group_id: str | None, parent_id: str | None) -> None:
        if parent_id is None:
            return
        parent = await self.repository.get(parent_id)
        if parent is None or parent.archived:
            raise GroupNotFoundError(f"Parent group {parent_id!r} was not found")
        current: Group | None = parent
        visited: set[str] = set()
        while current:
            if current.id == group_id or current.id in visited:
                raise GroupCycleError("The requested parent would create a group cycle")
            visited.add(current.id)
            current = await self.repository.get(current.parent_id) if current.parent_id else None

    async def list(self, flat: bool, include_descendant_count: bool) -> list[dict[str, Any]]:
        groups = await self.repository.active()
        counts = await self.repository.tab_counts()
        mapped = {
            group.id: self.mapper.to_dto(group, counts.get(group.id, 0)).model_dump(
                mode="json", by_alias=True
            )
            for group in groups
        }
        if include_descendant_count:
            children: dict[str, list[str]] = {}
            for group in groups:
                if group.parent_id:
                    children.setdefault(group.parent_id, []).append(group.id)

            def total(group_id: str) -> int:
                return counts.get(group_id, 0) + sum(
                    total(child) for child in children.get(group_id, [])
                )

            for group_id, item in mapped.items():
                item["totalTabCount"] = total(group_id)
        if flat:
            return list(mapped.values())
        roots: list[dict[str, Any]] = []
        for group in groups:
            mapped[group.id]["children"] = []
        for group in groups:
            if group.parent_id and group.parent_id in mapped:
                mapped[group.parent_id]["children"].append(mapped[group.id])
            else:
                roots.append(mapped[group.id])
        return roots

    async def create(self, dto: GroupCreateDTO) -> dict[str, Any]:
        await self._validate_parent(dto.id, dto.parent_id)
        position = dto.position
        if position is None:
            position = (
                float(
                    await self.db.scalar(
                        select(func.coalesce(func.max(Group.position), -1)).where(
                            Group.parent_id == dto.parent_id
                        )
                    )
                    or -1
                )
                + 1
            )
        values = dict(
            name=dto.name,
            parent_id=dto.parent_id,
            color=dto.color,
            position=position,
            archived=dto.archived,
            archived_at=dto.archived_at,
            created_at=dto.created_at or utc_now(),
            updated_at=dto.updated_at or utc_now(),
        )
        if dto.id:
            values["id"] = dto.id
        group = Group(**values)
        self.db.add(group)
        await self.db.commit()
        return self.mapper.to_dto(group).model_dump(mode="json", by_alias=True)

    async def update(self, group_id: str, dto: GroupUpdateDTO) -> dict[str, Any]:
        group = await self.repository.get(group_id)
        if group is None or group.archived:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        changes = dto.model_dump(exclude_unset=True)
        if "parent_id" in changes:
            await self._validate_parent(group_id, changes["parent_id"])
        for key, value in changes.items():
            setattr(group, key, value)
        group.updated_at = utc_now()
        await self.db.commit()
        return self.mapper.to_dto(group).model_dump(mode="json", by_alias=True)

    async def descendants(self, group_id: str) -> set[str]:
        groups = await self.repository.active()
        result = {group_id}
        changed = True
        while changed:
            before = len(result)
            result.update(group.id for group in groups if group.parent_id in result)
            changed = len(result) != before
        return result

    async def delete(
        self, group_id: str, strategy: Literal["cascade", "promote", "reject_if_nonempty"]
    ) -> dict[str, Any]:
        group = await self.repository.get(group_id)
        if group is None or group.archived:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        children = list(
            (
                await self.db.scalars(
                    select(Group).where(Group.parent_id == group_id, Group.archived.is_(False))
                )
            ).all()
        )
        tabs = list(
            (
                await self.db.scalars(
                    select(Tab).where(Tab.group_id == group_id, Tab.archived.is_(False))
                )
            ).all()
        )
        if strategy == "reject_if_nonempty" and (children or tabs):
            raise GroupNotEmptyError("Group contains tabs or child groups")
        now = utc_now()
        if strategy == "cascade":
            ids = await self.descendants(group_id)
            for child in (await self.db.scalars(select(Group).where(Group.id.in_(ids)))).all():
                child.archived = True
                child.archived_at = now
                child.updated_at = now
            for tab in (await self.db.scalars(select(Tab).where(Tab.group_id.in_(ids)))).all():
                tab.archived = True
                tab.archived_at = now
                tab.updated_at = now
        else:
            for child in children:
                child.parent_id = group.parent_id
                child.updated_at = now
            for tab in tabs:
                tab.group_id = group.parent_id
                tab.updated_at = now
            group.archived = True
            group.archived_at = now
            group.updated_at = now
        await self.db.commit()
        return {
            "id": group_id,
            "strategy": strategy,
            "deletedAt": now.isoformat().replace("+00:00", "Z"),
        }

    async def hard_delete(self, group_id: str) -> None:
        await self.db.execute(delete(Group).where(Group.id == group_id))
        self.db.add(Tombstone(entity_type="group", entity_id=group_id))
        await self.db.commit()
