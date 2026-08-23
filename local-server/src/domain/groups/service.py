"""Group application service and transaction boundaries."""

from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import TabVisibility
from lib.time import utc_now

from .dto import GroupCreateDTO, GroupDeleteResultDTO, GroupDTO, GroupUpdateDTO
from .error import EmptyGroupUpdateError, GroupNotFoundError
from .mapper import GroupMapper
from .repository import GroupRepository


class GroupService:
    """Orchestrate flat Group use cases."""

    def __init__(self, db: AsyncSession, repository: GroupRepository) -> None:
        """Initialize the service and persistence dependency."""
        self.db = db
        self.repository = repository
        self.mapper = GroupMapper()

    async def list(
        self, visibility: TabVisibility = "visible", category: str | None = None
    ) -> list[GroupDTO]:
        """List Groups relevant to one mutually exclusive visibility page."""
        groups = await self.repository.list_groups(category)
        if visibility == "archived":
            return []
        visible, hidden = await self.repository.tab_counts(utc_now())
        if visibility == "hidden":
            return [
                self.mapper.to_dto(group, hidden[group.id])
                for group in groups
                if hidden.get(group.id, 0) > 0
            ]
        return [
            self.mapper.to_dto(group, visible.get(group.id, 0))
            for group in groups
            if visible.get(group.id, 0) > 0 or hidden.get(group.id, 0) == 0
        ]

    async def get(self, group_id: str) -> GroupDTO:
        """Return one Group or fail without hierarchy semantics."""
        group = await self.repository.get(group_id)
        if group is None:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        visible, _hidden = await self.repository.tab_counts(utc_now())
        return self.mapper.to_dto(group, visible.get(group.id, 0))

    async def create(self, dto: GroupCreateDTO) -> GroupDTO:
        """Create one Group."""
        position = (
            dto.position if dto.position is not None else await self.repository.next_position()
        )
        group = self.mapper.from_create_dto(dto, position)
        try:
            await self.repository.add_group(group)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return self.mapper.to_dto(group)

    async def update(self, group_id: str, dto: GroupUpdateDTO) -> GroupDTO:
        """Patch one Group."""
        group = await self.repository.get(group_id)
        if group is None:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        changes = self.mapper.to_update_dict(dto)
        if not changes:
            raise EmptyGroupUpdateError("At least one Group field is required")
        changes["updated_at"] = utc_now()
        try:
            await self.repository.apply_changes(group, changes)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return self.mapper.to_dto(group)

    async def delete(self, group_id: str) -> GroupDeleteResultDTO:
        """Archive and Unassign all members, then permanently delete the Group."""
        if await self.repository.get(group_id) is None:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        now = utc_now()
        try:
            archived_tab_count = await self.repository.delete_with_tabs(group_id, now)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return GroupDeleteResultDTO(
            id=group_id, archived_tab_count=archived_tab_count, deleted_at=now
        )
