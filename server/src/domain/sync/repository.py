"""Apply all library resource kinds through one transactional synchronization path."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.custom_properties.dto import PropertyDefinitionDTO
from domain.custom_properties.service import CustomPropertyService
from domain.groups.repository import GroupRepository
from domain.tags.repository import TagRepository
from domain.transfer.dto import TransferGroupDTO, TransferTabDTO, TransferTagDTO
from domain.transfer.mapper import TransferMapper
from domain.transfer.repository import TransferRepository
from lib.model_changes import apply_model_changes
from models import Group, LibraryMetadata, PropertyDefinition, Tab, Tag, Tombstone

from .dto import ChangeDTO
from .metadata import clear_deletion, record_deletion


class SyncRepository:
    """Stage resource changes in the request transaction without committing."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind a request session and its transfer repository.

        Args:
            session (AsyncSession): Transaction used for all staged records.
        """
        self.session = session
        self.transfer = TransferRepository(session)

    async def metadata(self) -> LibraryMetadata:
        """Return persisted generation metadata or raise if initialization failed.

        Returns:
            LibraryMetadata: Current schema and generation.
        """
        row = await self.session.get(LibraryMetadata, 1)
        if row is None:
            raise RuntimeError("Library metadata is missing")
        return row

    async def definitions(self) -> list[PropertyDefinition]:
        """Return timestamped definitions.

        Returns:
            list[PropertyDefinition]: Current definition rows.
        """
        return list((await self.session.scalars(select(PropertyDefinition))).all())

    async def tombstones(self) -> list[Tombstone]:
        """Return deletion markers.

        Returns:
            list[Tombstone]: All markers retained for offline clients.
        """
        return list((await self.session.scalars(select(Tombstone))).all())

    async def flush(self) -> None:
        """Flush staged mutations before producing the response snapshot."""
        await self.session.flush()

    async def apply_change(self, change: ChangeDTO) -> None:
        """Stage one last-write-wins resource mutation without committing.

        Args:
            change (ChangeDTO): Upsert or deletion with a stable identity and timestamp.

        Raises:
            ValueError: The payload or its references violate the resource contract.
        """
        identity = change.id.lower() if change.kind == "tag" else change.id
        models = {"tab": Tab, "group": Group, "tag": Tag, "property": PropertyDefinition}
        row: Any = (
            await self.transfer.get_tag(identity)
            if change.kind == "tag"
            else await self.session.get(models[change.kind], identity)
        )
        tombstone = await self.session.scalar(
            select(Tombstone).where(
                Tombstone.entity_type == change.kind, Tombstone.entity_id == identity
            )
        )
        if tombstone is not None and (
            change.kind in {"tab", "group"} or change.updated_at <= tombstone.deleted_at
        ):
            return
        if row is not None:
            updated = (
                row.timestamps.updated_at if change.kind in {"tab", "group"} else row.updated_at
            )
            if change.updated_at <= updated:
                return
        if change.data is None:
            if row is not None:
                if change.kind == "group":
                    await GroupRepository(self.session).delete_with_tabs(
                        identity, change.updated_at
                    )
                    # Repository already staged the tombstone.
                    await self.session.flush()
                elif change.kind == "tag":
                    await TagRepository(self.session).delete_tag(row, change.updated_at)
                else:
                    if change.kind == "tab":
                        row.lifecycle.archived = True
                        row.lifecycle.archived_at = change.updated_at
                        row.placement.group_id = None
                        await self.session.flush()
                    await self.session.delete(row)
            await record_deletion(self.session, change.kind, identity, change.updated_at)
            return
        payload = change.data
        mapper = TransferMapper()
        if change.kind == "property":
            definition = PropertyDefinitionDTO.model_validate({"name": identity, **payload})
            if definition.name != identity:
                raise ValueError("Property identity must match its name")
            values = definition.model_dump(exclude={"name"})
            if row is None:
                self.session.add(
                    PropertyDefinition(
                        name=identity, definition=values, updated_at=change.updated_at
                    )
                )
            else:
                row.definition = values
                row.updated_at = change.updated_at
        elif change.kind == "tag":
            tag = TransferTagDTO.model_validate(payload)
            if tag.name.lower() != identity or not tag.name.strip():
                raise ValueError("Tag identity must match its name")
            tag.updated_at = change.updated_at
            if row is None:
                self.session.add(mapper.tag_from_dto(tag))
            else:
                apply_model_changes(row, mapper.tag_changes(tag))
        elif change.kind == "group":
            group = TransferGroupDTO.model_validate(payload)
            if (
                group.id != identity
                or not group.details.name.strip()
                or not group.details.category.strip()
            ):
                raise ValueError("Group identity, name, and category are required")
            group.timestamps.updated_at = change.updated_at
            if row is None:
                self.session.add(mapper.group_from_dto(group))
            else:
                apply_model_changes(row, mapper.group_changes(group))
        else:
            from domain.tabs.dto import _validate_saved_url

            tab = TransferTabDTO.model_validate(payload)
            _validate_saved_url(tab.content.url)
            if tab.id != identity or not tab.content.title.strip():
                raise ValueError("Tab identity and title are required")
            tab.timestamps.updated_at = change.updated_at
            if tab.placement.group_id is not None:
                group_row = await self.session.get(Group, tab.placement.group_id)
                if group_row is None:
                    if await self.transfer.tombstone_exists("group", tab.placement.group_id):
                        tab.lifecycle.archived = True
                        tab.lifecycle.archived_at = change.updated_at
                        tab.placement.group_id = None
                    else:
                        raise ValueError("Unknown destination group")
            if tab.lifecycle.archived:
                tab.placement.group_id = None
                tab.lifecycle.archived_at = tab.lifecycle.archived_at or change.updated_at
            else:
                tab.lifecycle.archived_at = None
            definitions = await self.transfer.property_definitions()
            previous = row.annotations.custom_properties if row is not None else {}
            changed = {
                key: value
                for key, value in tab.annotations.custom_properties.items()
                if key not in previous or previous[key] != value
            }
            # Deleted definitions retain raw values, including offline copies of those values.
            for key in list(changed):
                if key not in definitions and await self.transfer.tombstone_exists("property", key):
                    del changed[key]
            CustomPropertyService.validate_patch(changed, definitions)
            names = [
                name
                for name in tab.annotations.tags
                if not await self.transfer.tombstone_exists("tag", name.lower())
            ]
            tags = await self.transfer.resolve_tags(names)
            if row is None:
                self.session.add(mapper.tab_from_dto(tab, tags))
            else:
                apply_model_changes(row, mapper.tab_changes(tab, tags))
        if tombstone is not None:
            await clear_deletion(self.session, change.kind, identity)
        await self.session.flush()
