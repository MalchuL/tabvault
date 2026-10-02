"""Typed Custom Property Schema requests and results."""

from __future__ import annotations

import math
import re
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field, RootModel, model_validator

from lib.dto_config import model_config

PropertyType: TypeAlias = Literal["int", "float", "string", "boolean", "json"]
PROPERTY_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def is_json_value(value: Any) -> bool:
    """Return whether a value can be represented safely as JSON.

    Args:
        value (Any): Candidate value supplied at an API or persistence boundary.

    Returns:
        bool: Whether the complete nested value uses only JSON-compatible types and finite numbers.
    """
    if value is None or isinstance(value, (str, bool)):
        return True
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and is_json_value(item) for key, item in value.items())
    return False


def matches_type(value: Any, property_type: PropertyType) -> bool:
    """Return whether a value exactly satisfies one declared property type.

    Args:
        value (Any): Value to check without coercion.
        property_type (PropertyType): Schema type that governs the value.

    Returns:
        bool: Whether the value is accepted by the declared type.
    """
    if property_type == "boolean":
        return isinstance(value, bool)
    if property_type == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if property_type == "float":
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and (not isinstance(value, float) or math.isfinite(value))
        )
    if property_type == "string":
        return isinstance(value, str)
    return is_json_value(value)


class PropertyDefinitionDTO(BaseModel):
    """Define one stable custom property and its read-time default.

    Attributes:
        name (str): Case-sensitive property identity shared by schema and Saved Tab values.
        description (str): Optional human explanation rendered by clients.
        type (PropertyType): Exact validation type applied to defaults and explicit values.
        default (Any): Value returned when a stored override is missing or invalid.
    """

    name: str = Field(pattern=PROPERTY_NAME.pattern, max_length=128)
    description: str = Field(default="", max_length=1000)
    type: PropertyType
    default: Any
    model_config = model_config()

    @model_validator(mode="after")
    def default_matches_type(self) -> PropertyDefinitionDTO:
        """Reject a definition whose default does not satisfy its declared type.

        Returns:
            PropertyDefinitionDTO: The validated definition.

        Raises:
            ValueError: The default is null for a typed property or has an incompatible type.
        """
        if not matches_type(self.default, self.type):
            raise ValueError(f"default must match property type {self.type}")
        return self


class PropertyDefinitionDataDTO(BaseModel):
    """Represent a definition stored beneath its schema key.

    Attributes:
        description (str): Optional human explanation rendered by clients.
        type (PropertyType): Exact validation type for values.
        default (Any): Read-time fallback value.
    """

    description: str = ""
    type: PropertyType
    default: Any
    model_config = model_config()


class PropertySchemaDTO(BaseModel):
    """Represent the singleton Library Custom Property Schema.

    Attributes:
        properties (dict[str, PropertyDefinitionDataDTO]): Definitions keyed by stable name.
    """

    properties: dict[str, PropertyDefinitionDataDTO] = Field(default_factory=dict)
    model_config = model_config()


class CustomPropertiesPatchDTO(RootModel[dict[str, Any]]):
    """Carry an atomic partial set of explicit Saved Tab property values."""


class CustomPropertiesUnsetDTO(BaseModel):
    """Select explicit Saved Tab overrides to remove atomically.

    Attributes:
        properties (list[str]): Unique property names whose stored overrides should be removed.
    """

    properties: list[str] = Field(min_length=1, max_length=256)
    model_config = model_config()

    @model_validator(mode="after")
    def names_are_unique(self) -> CustomPropertiesUnsetDTO:
        """Reject duplicate names in one unset request.

        Returns:
            CustomPropertiesUnsetDTO: The validated request.

        Raises:
            ValueError: The same name occurs more than once.
        """
        if len(self.properties) != len(set(self.properties)):
            raise ValueError("properties must not contain duplicates")
        return self


class PropertyValidationIssueDTO(BaseModel):
    """Locate one incompatible or undeclared stored property value.

    Attributes:
        tab_id (str): Saved Tab containing the raw value.
        property (str): Stored property name.
        code (Literal["invalidType", "undeclaredProperty"]): Stable issue category.
        expected_type (PropertyType | None): Declared type, absent for undeclared values.
        actual_type (str): Runtime JSON type observed in storage.
    """

    tab_id: str
    property: str
    code: Literal["invalidType", "undeclaredProperty"]
    expected_type: PropertyType | None = None
    actual_type: str
    model_config = model_config()


class PropertyValidationSummaryDTO(BaseModel):
    """Count records and issues found during a Library-wide validation.

    Attributes:
        tabs_scanned (int): Number of Saved Tabs inspected.
        invalid_values (int): Declared values with incompatible types.
        undeclared_values (int): Stored values absent from the schema.
    """

    tabs_scanned: int
    invalid_values: int
    undeclared_values: int
    model_config = model_config()


class PropertyValidationDTO(BaseModel):
    """Return the complete result of validating stored Custom Property Values.

    Attributes:
        valid (bool): Whether storage contains no incompatible or undeclared values.
        summary (PropertyValidationSummaryDTO): Aggregate scan counts.
        issues (list[PropertyValidationIssueDTO]): Locations and categories of every issue.
    """

    valid: bool
    summary: PropertyValidationSummaryDTO
    issues: list[PropertyValidationIssueDTO]
    model_config = model_config()


class PropertyRepairDTO(BaseModel):
    """Report mutations made by one atomic Custom Property Repair.

    Attributes:
        tabs_scanned (int): Number of Saved Tabs inspected.
        converted (int): Incompatible values converted losslessly.
        removed (int): Undeclared or unconvertible overrides deleted.
        unchanged (int): Valid stored overrides retained.
    """

    tabs_scanned: int
    converted: int
    removed: int
    unchanged: int
    model_config = model_config()
