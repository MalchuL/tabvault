"""Shared Pydantic configuration for public DTOs."""

from pydantic import AliasGenerator, ConfigDict
from pydantic.alias_generators import to_camel


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
