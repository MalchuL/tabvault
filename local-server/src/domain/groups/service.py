"""Group application service and transaction boundaries."""

from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import TabVisibility
from lib.pagination import ListOptions, Page
from lib.time import utc_now
from models import Group

from .dto import (
    GroupCreateDTO,
    GroupDeleteResultDTO,
    GroupDTO,
    GroupListResponseDTO,
    GroupUpdateDTO,
)
from .error import EmptyGroupUpdateError, GroupNotFoundError
from .mapper import GroupMapper
from .repository import GroupRepository


class GroupService:
    """Apply flat Group lifecycle rules and own their database transactions.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        repository (GroupRepository): Persistence adapter retained for this service instance.
        mapper (GroupMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(self, db: AsyncSession, repository: GroupRepository) -> None:
        """Create a Group service using one request-scoped database session.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session.
            repository (GroupRepository): Persistence adapter used by this service.
        """
        self.db = db
        self.repository = repository
        self.mapper = GroupMapper()

    async def _required_group(self, group_id: str) -> Group:
        """Load a Group or raise the shared missing-ID domain error.

        Args:
            group_id (str): Collection ID or null for Unassigned.

        Returns:
            Group: Group row read or staged by this operation.

        Raises:
            GroupNotFoundError: No group has the requested ID.
        """
        group = await self.repository.get(group_id)
        if group is None:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        return group

    async def list(
        self,
        visibility: TabVisibility,
        category: str | None,
        list_options: ListOptions,
    ) -> GroupListResponseDTO:
        """List Groups for one visibility page; Archive has no Groups.

        Args:
            visibility (TabVisibility): Visible, hidden, or archived tab scope.
            category (str | None): Optional collection category filter.
            list_options (ListOptions): Page size and row offset for the query.

        Returns:
            GroupListResponseDTO: Matching groups, tab counts, and pagination metadata.
        """
        if visibility == "archived":
            return GroupListResponseDTO.from_page(Page(data=[], has_next=False, total=0))
        page = await self.repository.list_groups(utc_now(), visibility, category, list_options)
        return GroupListResponseDTO.from_page(
            page.map(lambda item: self.mapper.to_dto(item[0], item[1]))
        )

    async def get(self, group_id: str) -> GroupDTO:
        """Return a Group with its current visible Saved Tab count.

        Args:
            group_id (str): Collection ID or null for Unassigned.

        Returns:
            GroupDTO: Current group name, category, color, and timestamps.
        """
        group = await self._required_group(group_id)
        visible, _hidden = await self.repository.tab_counts(utc_now())
        return self.mapper.to_dto(group, visible.get(group.id, 0))

    async def create(self, dto: GroupCreateDTO) -> GroupDTO:
        """Create a Group at the requested or next available position.

        Args:
            dto (GroupCreateDTO): Validated request data for the operation.

        Returns:
            GroupDTO: Current group name, category, color, and timestamps.
        """
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
        """Reject empty patches and commit one Group update atomically.

        Args:
            group_id (str): Collection ID or null for Unassigned.
            dto (GroupUpdateDTO): Validated request data for the operation.

        Returns:
            GroupDTO: Current group name, category, color, and timestamps.

        Raises:
            EmptyGroupUpdateError: The patch contains no group fields.
        """
        group = await self._required_group(group_id)
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
        """Archive and Unassign member tabs before deleting the Group atomically.

        Args:
            group_id (str): Collection ID or null for Unassigned.

        Returns:
            GroupDeleteResultDTO: Deleted group ID and number of archived member tabs.
        """
        await self._required_group(group_id)
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
