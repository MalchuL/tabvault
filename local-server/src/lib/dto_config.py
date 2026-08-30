"""Shared Pydantic configuration for public DTOs."""

from datetime import datetime

from pydantic import (
    AliasGenerator,
    BaseModel,
    ConfigDict,
    SerializerFunctionWrapHandler,
    field_serializer,
    field_validator,
)
from pydantic.alias_generators import to_camel

from lib.time import rfc3339, stored_utc


def model_config() -> ConfigDict:
    """Return strict camelCase alias configuration for an API DTO.

    This shared backend helper centralizes the behavior so API, domain, and infrastructure code use
    the same representation and edge-case handling.

    Returns:
        ConfigDict: Result produced by the operation described above.
    """
    return ConfigDict(
        alias_generator=AliasGenerator(validation_alias=to_camel, serialization_alias=to_camel),
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class DTO(BaseModel):
    """Public API DTO with camelCase aliases and RFC 3339 UTC timestamps.

    Incoming naive timestamps are treated as UTC so older vaults and portable documents stay
    valid. JSON serialization always emits a trailing ``Z``.
    """

    model_config = model_config()

    @field_validator("*", mode="after")
    @classmethod
    def stored_datetimes_are_utc(cls, value: object) -> object:
        """Treat naive timestamps as UTC so missing offsets do not stay naive.

        Args:
            value (object): Validated field value, which may be a datetime or any other DTO field.

        Returns:
            object: A UTC-aware datetime when the field is a timestamp, otherwise ``value``.
        """
        if isinstance(value, datetime):
            return stored_utc(value) or value
        return value

    @field_serializer("*", when_used="json", mode="wrap")
    def serialize_rfc3339_datetimes(
        self, value: object, handler: SerializerFunctionWrapHandler
    ) -> object:
        """Emit RFC 3339 UTC timestamps with a trailing ``Z``.

        Args:
            value (object): Field value being serialized to JSON.
            handler (SerializerFunctionWrapHandler): Default serializer for non-datetime fields.

        Returns:
            object: An RFC 3339 string for datetimes, otherwise the default JSON value.
        """
        if isinstance(value, datetime):
            return rfc3339(value)
        return handler(value)
