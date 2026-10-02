"""Map Saved Tab DTOs and persistence models."""

from __future__ import annotations

from typing import Any

from lib.time import stored_utc
from models import Tab, TabAnnotations, TabContent, TabLifecycle, TabPlacement, Tag

from .dto import TabCreateDTO, TabDTO, TabProjectionDTO, TabUpdateDTO


class TabMapper:
    """Convert between Saved Tab DTOs and ORM models.

    Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
    boundary and centralizes differences between database field names, public DTOs, and portable
    transfer records.
    """

    @staticmethod
    def to_dto(tab: Tab, custom_properties: dict[str, Any]) -> TabDTO:
        """Convert a Saved Tab row to its complete response DTO.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.
            custom_properties (dict[str, Any]): Declared values after default resolution.

        Returns:
            TabDTO: Complete API representation of the saved tab.
        """
        return TabDTO.model_validate(
            {
                "id": tab.id,
                "content": {
                    "url": tab.content.url,
                    "title": tab.content.title,
                },
                "annotations": {
                    "custom_properties": custom_properties,
                    "tags": [tag.name for tag in tab.tags],
                },
                "placement": {
                    "group_id": tab.placement.group_id,
                    "position": tab.placement.position,
                },
                "lifecycle": {
                    "archived": tab.lifecycle.archived,
                    "archived_at": stored_utc(tab.lifecycle.archived_at),
                    "hidden_until": stored_utc(tab.lifecycle.hidden_until),
                },
                "timestamps": {
                    "created_at": stored_utc(tab.timestamps.created_at)
                    or tab.timestamps.created_at,
                    "updated_at": stored_utc(tab.timestamps.updated_at)
                    or tab.timestamps.updated_at,
                },
            }
        )

    @classmethod
    def to_projection(
        cls, tab: Tab, fields: str, custom_properties: dict[str, Any]
    ) -> TabDTO | TabProjectionDTO:
        """Convert a Saved Tab to the requested field projection.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            tab (Tab): Saved-tab row being converted or persisted.
            fields (str): Requested response projection controlling which fields are serialized.
            custom_properties (dict[str, Any]): Declared values after default resolution.

        Returns:
            TabDTO | TabProjectionDTO: Complete or requested-field tab representation.
        """
        dto = cls.to_dto(tab, custom_properties)
        if fields == "full":
            return dto
        paths = (
            {
                "id",
                "content.url",
                "content.title",
                "content.favicon",
                "placement.groupId",
                "annotations.tags",
            }
            if fields == "minimal"
            else {value.strip() for value in fields.split(",")}
        )
        values = dto.model_dump(by_alias=True)
        selected: dict[str, Any] = {}
        for path in paths:
            group, separator, field = path.partition(".")
            if group not in values:
                continue
            if separator and isinstance(values[group], dict) and field in values[group]:
                selected.setdefault(group, {})[field] = values[group][field]
            elif not separator:
                selected[group] = values[group]
        return TabProjectionDTO.model_validate(selected)

    @staticmethod
    def from_create_dto(
        dto: TabCreateDTO, *, group_id: str | None, position: float, tags: list[Tag]
    ) -> Tab:
        """Create a Saved Tab occurrence without URL normalization.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TabCreateDTO): Validated data-transfer object supplied to the operation.
            group_id (str | None): Stable identifier of the group targeted by the operation.
            position (float): Display position assigned within the target group.
            tags (list[Tag]): Tags associated with the saved tab.

        Returns:
            Tab: Unsaved saved-tab model initialized from the request.
        """
        values: dict[str, Any] = {
            "content": TabContent(url=dto.content.url, title=dto.content.title or dto.content.url),
            "annotations": TabAnnotations(
                custom_properties=dict(dto.annotations.custom_properties),
            ),
            "placement": TabPlacement(group_id=group_id, position=position),
            "lifecycle": TabLifecycle(),
            "tags": tags,
        }
        if dto.id is not None:
            values["id"] = dto.id
        return Tab(**values)

    @staticmethod
    def to_update_dict(dto: TabUpdateDTO) -> dict[str, Any]:
        """Convert explicitly supplied fields to ORM names.

        Keeping this conversion explicit prevents SQLAlchemy models from leaking through the API
        boundary and centralizes differences between database field names, public DTOs, and portable
        transfer records.

        Args:
            dto (TabUpdateDTO): Validated data-transfer object supplied to the operation.

        Returns:
            dict[str, Any]: Explicitly supplied tab fields keyed by ORM attribute name.
        """
        values = {
            field: value
            for group in dto.model_dump(exclude_unset=True).values()
            for field, value in group.items()
        }
        return values
