"""Custom Property Schema application service and resolution rules."""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from lib.time import utc_now
from models import Tab

from .dto import (
    PropertyDefinitionDTO,
    PropertyRepairDTO,
    PropertySchemaDTO,
    PropertyType,
    PropertyValidationDTO,
    PropertyValidationIssueDTO,
    PropertyValidationSummaryDTO,
    matches_type,
)
from .error import InvalidCustomPropertiesError, PropertyDefinitionNotFoundError
from .repository import CustomPropertyRepository

INTEGER_TEXT = re.compile(r"^-?(?:0|[1-9][0-9]*)$")
FLOAT_TEXT = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$")


def json_type(value: Any) -> str:
    """Return a stable JSON-oriented runtime type label.

    Args:
        value (Any): Stored value being described in validation output.

    Returns:
        str: One of null, boolean, integer, number, string, array, object, or unknown.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "unknown"


def convert_value(value: Any, property_type: PropertyType) -> tuple[bool, Any]:
    """Apply the agreed narrow, deterministic repair conversion matrix.

    Args:
        value (Any): Incompatible raw override to convert.
        property_type (PropertyType): Target schema type.

    Returns:
        tuple[bool, Any]: Success flag and converted value, or ``None`` after failure.
    """
    if property_type == "int" and isinstance(value, str) and INTEGER_TEXT.fullmatch(value):
        return True, int(value)
    if property_type == "float":
        if isinstance(value, int) and not isinstance(value, bool):
            return True, float(value)
        if isinstance(value, str) and FLOAT_TEXT.fullmatch(value):
            converted = float(value)
            if matches_type(converted, "float"):
                return True, converted
    if property_type == "boolean" and isinstance(value, str) and value in {"true", "false"}:
        return True, value == "true"
    if property_type == "json" and isinstance(value, str):
        try:
            converted = json.loads(value)
        except json.JSONDecodeError:
            return False, None
        if matches_type(converted, "json"):
            return True, converted
    return False, None


class CustomPropertyService:
    """Orchestrate schema mutation, value resolution, validation, and repair.

    Attributes:
        db (AsyncSession): Request-scoped session whose transactions this service owns.
        repository (CustomPropertyRepository): Persistence operations staged within that session.
    """

    def __init__(self, db: AsyncSession, repository: CustomPropertyRepository) -> None:
        """Initialize the service and persistence dependency.

        Args:
            db (AsyncSession): Request-scoped session used to commit or roll back use cases.
            repository (CustomPropertyRepository): Schema and tab persistence adapter.
        """
        self.db = db
        self.repository = repository

    async def definitions(self) -> dict[str, dict[str, Any]]:
        """Return raw schema definitions without creating database state.

        Returns:
            dict[str, dict[str, Any]]: Definitions keyed by stable case-sensitive name.
        """
        schema = await self.repository.get_schema()
        return dict(schema.properties or {}) if schema is not None else {}

    async def get(self) -> PropertySchemaDTO:
        """Return the singleton schema or an empty read-only representation.

        Returns:
            PropertySchemaDTO: Current definitions keyed by property name.
        """
        return PropertySchemaDTO.model_validate({"properties": await self.definitions()})

    async def upsert(self, dto: PropertyDefinitionDTO) -> PropertySchemaDTO:
        """Create or replace one definition by stable name.

        Args:
            dto (PropertyDefinitionDTO): Fully validated replacement definition.

        Returns:
            PropertySchemaDTO: Complete schema after the committed mutation.
        """
        try:
            schema = await self.repository.get_or_create_schema()
            properties = dict(schema.properties or {})
            properties[dto.name] = dto.model_dump(exclude={"name"})
            schema.properties = properties
            schema.updated_at = utc_now()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return PropertySchemaDTO.model_validate({"properties": properties})

    async def delete(self, name: str) -> PropertySchemaDTO:
        """Remove one definition while retaining now-undeclared raw tab values.

        Args:
            name (str): Stable definition identity to remove.

        Returns:
            PropertySchemaDTO: Complete schema after deletion.

        Raises:
            PropertyDefinitionNotFoundError: The schema does not declare the requested name.
        """
        schema = await self.repository.get_schema()
        properties = dict(schema.properties or {}) if schema is not None else {}
        if name not in properties:
            raise PropertyDefinitionNotFoundError(f"Property {name!r} is not declared")
        del properties[name]
        try:
            assert schema is not None
            schema.properties = properties
            schema.updated_at = utc_now()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return PropertySchemaDTO.model_validate({"properties": properties})

    @staticmethod
    def resolve_values(
        raw: dict[str, Any] | None, definitions: dict[str, dict[str, Any]]
    ) -> dict[str, Any]:
        """Resolve declared properties without mutating invalid or missing storage.

        Args:
            raw (dict[str, Any] | None): Explicit overrides stored on one Saved Tab.
            definitions (dict[str, dict[str, Any]]): Current schema definitions.

        Returns:
            dict[str, Any]: Declared names mapped to valid overrides or schema defaults.
        """
        stored = raw or {}
        return {
            name: stored[name]
            if name in stored and matches_type(stored[name], definition["type"])
            else definition["default"]
            for name, definition in definitions.items()
        }

    @staticmethod
    def validate_patch(values: dict[str, Any], definitions: dict[str, dict[str, Any]]) -> None:
        """Validate every supplied key before an atomic partial update.

        Args:
            values (dict[str, Any]): Explicit overrides supplied by a client.
            definitions (dict[str, dict[str, Any]]): Current schema definitions.

        Raises:
            InvalidCustomPropertiesError: A name is undeclared or a value has the wrong type.
        """
        failures: list[str] = []
        for name, value in values.items():
            definition = definitions.get(name)
            if definition is None:
                failures.append(f"{name}: property is not declared")
            elif not matches_type(value, definition["type"]):
                failures.append(f"{name}: value must have type {definition['type']}")
        if failures:
            raise InvalidCustomPropertiesError("; ".join(failures), received=values)

    async def validation(self) -> PropertyValidationDTO:
        """Validate every raw Saved Tab override against the current schema.

        Returns:
            PropertyValidationDTO: Aggregate counts and every invalid or undeclared location.
        """
        definitions = await self.definitions()
        tabs = await self.repository.list_tabs()
        issues: list[PropertyValidationIssueDTO] = []
        for tab in tabs:
            for name, value in (tab.custom_properties or {}).items():
                definition = definitions.get(name)
                if definition is None:
                    issues.append(
                        PropertyValidationIssueDTO(
                            tab_id=tab.id,
                            property=name,
                            code="undeclaredProperty",
                            actual_type=json_type(value),
                        )
                    )
                elif not matches_type(value, definition["type"]):
                    issues.append(
                        PropertyValidationIssueDTO(
                            tab_id=tab.id,
                            property=name,
                            code="invalidType",
                            expected_type=definition["type"],
                            actual_type=json_type(value),
                        )
                    )
        invalid = sum(issue.code == "invalidType" for issue in issues)
        undeclared = len(issues) - invalid
        return PropertyValidationDTO(
            valid=not issues,
            summary=PropertyValidationSummaryDTO(
                tabs_scanned=len(tabs),
                invalid_values=invalid,
                undeclared_values=undeclared,
            ),
            issues=issues,
        )

    async def repair(self) -> PropertyRepairDTO:
        """Atomically repair every invalid or undeclared raw override in the Library.

        Returns:
            PropertyRepairDTO: Counts of scanned tabs and per-value outcomes.
        """
        definitions = await self.definitions()
        tabs = await self.repository.list_tabs()
        converted = removed = unchanged = 0
        try:
            for tab in tabs:
                repaired: dict[str, Any] = {}
                changed = False
                for name, value in (tab.custom_properties or {}).items():
                    definition = definitions.get(name)
                    if definition is None:
                        removed += 1
                        changed = True
                        continue
                    if matches_type(value, definition["type"]):
                        repaired[name] = value
                        unchanged += 1
                        continue
                    success, result = convert_value(value, definition["type"])
                    if success:
                        repaired[name] = result
                        converted += 1
                    else:
                        removed += 1
                    changed = True
                if changed:
                    tab.custom_properties = repaired
                    tab.updated_at = utc_now()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return PropertyRepairDTO(
            tabs_scanned=len(tabs), converted=converted, removed=removed, unchanged=unchanged
        )

    async def patch_tab(self, tab: Tab, values: dict[str, Any]) -> None:
        """Validate and stage an atomic partial property update on one Saved Tab.

        Args:
            tab (Tab): Persistent Saved Tab being updated.
            values (dict[str, Any]): Supplied key/value subset to merge into raw storage.

        Raises:
            InvalidCustomPropertiesError: Any supplied name or value violates the current schema.
        """
        definitions = await self.definitions()
        self.validate_patch(values, definitions)
        tab.custom_properties = {**(tab.custom_properties or {}), **values}
        tab.updated_at = utc_now()

    async def unset_tab(self, tab: Tab, names: list[str]) -> None:
        """Stage removal of selected explicit overrides from one Saved Tab.

        Args:
            tab (Tab): Persistent Saved Tab being updated.
            names (list[str]): Stored keys to remove; absent keys are idempotent no-ops.
        """
        values = dict(tab.custom_properties or {})
        for name in names:
            values.pop(name, None)
        tab.custom_properties = values
        tab.updated_at = utc_now()
