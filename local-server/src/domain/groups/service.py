"""Group application service and transaction boundaries."""

from sqlalchemy.ext.asyncio import AsyncSession

from domain.tabs.visibility import TabVisibility
from lib.pagination import ListOptions, Page
from lib.time import utc_now

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
    """Orchestrate flat Group use cases.

    This application-layer operation coordinates domain rules and persistence, then maps loaded ORM
    state into transport DTOs. Callers do not need to know how records are queried or related data
    is assembled.
    """

    def __init__(self, db: AsyncSession, repository: GroupRepository) -> None:
        """Initialize the service and persistence dependency.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session used by this operation.
            repository (GroupRepository): Persistence adapter used to load and mutate domain
                records.
        """
        self.db = db
        self.repository = repository
        self.mapper = GroupMapper()

    async def list(
        self,
        visibility: TabVisibility,
        category: str | None,
        list_options: ListOptions,
    ) -> GroupListResponseDTO:
        """List Groups relevant to one mutually exclusive visibility page.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.
            category (str | None): Optional free-form Group category used to restrict results.
            list_options (ListOptions): Validated page size and row offset.

        Returns:
            GroupListResponseDTO: Result produced by the operation described above.
        """
        if visibility == "archived":
            return GroupListResponseDTO.from_page(Page(data=[], has_next=False, total=0))
        page = await self.repository.list_groups(utc_now(), visibility, category, list_options)
        return GroupListResponseDTO.from_page(
            page.map(lambda item: self.mapper.to_dto(item[0], item[1]))
        )

    async def get(self, group_id: str) -> GroupDTO:
        """Return one Group or fail without hierarchy semantics.

        This application-layer operation coordinates domain rules and persistence, then maps loaded
        ORM state into transport DTOs. Callers do not need to know how records are queried or
        related data is assembled.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.

        Returns:
            GroupDTO: Result produced by the operation described above.

        Raises:
            GroupNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
        group = await self.repository.get(group_id)
        if group is None:
            raise GroupNotFoundError(f"Group {group_id!r} was not found")
        visible, _hidden = await self.repository.tab_counts(utc_now())
        return self.mapper.to_dto(group, visible.get(group.id, 0))

    async def create(self, dto: GroupCreateDTO) -> GroupDTO:
        """Create one Group.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            dto (GroupCreateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            GroupDTO: Result produced by the operation described above.
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
        """Patch one Group.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.
            dto (GroupUpdateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            GroupDTO: Result produced by the operation described above.

        Raises:
            EmptyGroupUpdateError: Propagated when its documented validation or operation condition
                occurs.
            GroupNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
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
        """Archive and Unassign all members, then permanently delete the Group.

        This application-layer operation coordinates validated domain input with repository
        operations. It owns the transaction boundary for mutations so related changes commit
        together and failures can be rolled back without exposing ORM rows to callers.

        Args:
            group_id (str): Stable identifier of the group targeted by the operation.

        Returns:
            GroupDeleteResultDTO: Result produced by the operation described above.

        Raises:
            GroupNotFoundError: Propagated when its documented validation or operation condition
                occurs.
        """
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
