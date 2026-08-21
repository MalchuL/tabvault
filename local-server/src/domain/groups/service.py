"""Group application service and transaction boundaries."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from lib.time import utc_now
from models import Group

from .dto import (
    GroupCreateDTO,
    GroupDeleteResultDTO,
    GroupDeleteStrategy,
    GroupDTO,
    GroupUpdateDTO,
)
from .error import GroupCycleError, GroupNotEmptyError, GroupNotFoundError
from .mapper import GroupMapper
from .repository import GroupRepository


class GroupService:
    """Orchestrate group use cases while owning transactions."""

    def __init__(self, db: AsyncSession, repository: GroupRepository) -> None:
        """Initialize the service and its persistence dependency."""
        self.db = db
        self.repository = repository
        self.mapper = GroupMapper()

    async def _validate_parent(self, group_id: str | None, parent_id: str | None) -> None:
        """Reject missing parents and parent cycles."""
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

    async def list(self, flat: bool, include_descendant_count: bool) -> list[GroupDTO]:
        """List active groups as a flat sequence or recursive tree."""
        groups = await self.repository.active()
        counts = await self.repository.tab_counts()
        mapped = {group.id: self.mapper.to_dto(group, counts.get(group.id, 0)) for group in groups}
        if include_descendant_count:
            children: dict[str, list[str]] = {}
            for group in groups:
                if group.parent_id:
                    children.setdefault(group.parent_id, []).append(group.id)

            def total(group_id: str) -> int:
                """Count direct and descendant tabs for one group."""
                return counts.get(group_id, 0) + sum(
                    total(child) for child in children.get(group_id, [])
                )

            for group_id, item in mapped.items():
                item.total_tab_count = total(group_id)
        if flat:
            return list(mapped.values())
        roots: list[GroupDTO] = []
        for group in groups:
            mapped[group.id].children = []
        for group in groups:
            if group.parent_id and group.parent_id in mapped:
                dto_children = mapped[group.parent_id].children
                assert dto_children is not None
                dto_children.append(mapped[group.id])
            else:
                roots.append(mapped[group.id])
        return roots

    async def create(self, dto: GroupCreateDTO) -> GroupDTO:
        """Create a group below an optional parent."""
        await self._validate_parent(dto.id, dto.parent_id)
        position = dto.position
        if position is None:
            position = await self.repository.next_position(dto.parent_id)
        group = self.mapper.from_create_dto(dto, position)
        await self.repository.add_group(group)
        await self.db.commit()
        return self.mapper.to_dto(group)

    async def update(self, group_id: str, dto: GroupUpdateDTO) -> GroupDTO:
        """Update one active group."""
        group = await self.repository.get(group_id)
        if group is None or group.archived:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        changes = self.mapper.to_update_dict(dto)
        if "parent_id" in changes:
            await self._validate_parent(group_id, changes["parent_id"])
        changes["updated_at"] = utc_now()
        await self.repository.apply_changes(group, changes)
        await self.db.commit()
        return self.mapper.to_dto(group)

    async def descendants(self, group_id: str) -> set[str]:
        """Return a group ID and every active descendant ID."""
        groups = await self.repository.active()
        result = {group_id}
        changed = True
        while changed:
            before = len(result)
            result.update(group.id for group in groups if group.parent_id in result)
            changed = len(result) != before
        return result

    async def delete(self, group_id: str, strategy: GroupDeleteStrategy) -> GroupDeleteResultDTO:
        """Delete a group using the selected child-handling strategy."""
        group = await self.repository.get(group_id)
        if group is None or group.archived:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        children = await self.repository.active_children(group_id)
        tabs = await self.repository.active_tabs(group_id)
        if strategy == "reject_if_nonempty" and (children or tabs):
            raise GroupNotEmptyError("Group contains tabs or child groups")
        now = utc_now()
        if strategy == "cascade":
            ids = await self.descendants(group_id)
            await self.repository.archive_tree(ids, now)
        else:
            await self.repository.promote_children(group, children, tabs, now)
        await self.db.commit()
        return GroupDeleteResultDTO(id=group_id, strategy=strategy, deleted_at=now)

    async def hard_delete(self, group_id: str) -> None:
        """Permanently delete a group and create a tombstone."""
        await self.repository.hard_delete(group_id)
        await self.db.commit()
