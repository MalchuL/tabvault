"""Runtime configuration and logging setup."""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class SettingsHttp(BaseModel):
    """Http fields for Settings."""

    api_prefix: str = "/api/v1"
    host: str = "127.0.0.1"
    port: int = 47821
    api_key: str | None = None
    cors_origins: Annotated[list[str], NoDecode] = ["*"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        """Accept CORS origins as a comma-separated environment value.

        Args:
            value (object): Value to validate, convert, or persist.

        Returns:
            object: Normalized value accepted by the validator.
        """
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()] or ["*"]
        return value

    model_config = SettingsConfigDict(extra="forbid")


class SettingsStorage(BaseModel):
    """Storage fields for Settings."""

    data_dir: Path = Field(default_factory=lambda: Path.home() / ".local/share/tabvault")
    database_url: str | None = None
    model_config = SettingsConfigDict(extra="forbid")

    @property
    def effective_database_url(self) -> str:
        """Return the configured database URL or local SQLite default.

        Returns:
            str: Configured database URL, or the SQLite URL under ``data_dir``.
        """
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{self.data_dir / 'tabvault.sqlite3'}"


class SettingsLogging(BaseModel):
    """Logging fields for Settings."""

    level: str = "INFO"
    model_config = SettingsConfigDict(extra="forbid")


class Settings(BaseSettings):
    """Load validated TabVault settings from environment variables. Fields are grouped by responsibility."""

    model_config = SettingsConfigDict(
        env_prefix="TABVAULT_", env_nested_delimiter="__", env_file=".env", extra="ignore"
    )

    @model_validator(mode="after")
    def validate_remote_auth(self) -> Settings:
        """Require authentication when listening beyond loopback.

        Returns:
            Settings: The validated settings instance for continued model validation.

        Raises:
            ValueError: The server binds beyond loopback without an API key.
        """
        if self.http.host not in {"127.0.0.1", "localhost", "::1"} and not self.http.api_key:
            raise ValueError("TABVAULT_HTTP__API_KEY is required when binding beyond loopback")
        return self

    http: SettingsHttp = Field(default_factory=SettingsHttp)
    storage: SettingsStorage = Field(default_factory=SettingsStorage)
    logging: SettingsLogging = Field(default_factory=SettingsLogging)


@lru_cache
def get_settings() -> Settings:
    """Return the process-cached runtime settings.

    Returns:
        Settings: Process-cached, environment-validated settings instance.
    """
    return Settings()


LOG_FORMAT = "%(asctime)s %(levelname)-5s [%(name)s] %(message)s"
LOG_DATE_FORMAT = "%H:%M:%S"


def configure_logging(settings: Settings) -> None:
    """Configure process-wide logging from validated settings.

    Applies ``TABVAULT_LOGGING__LEVEL`` to the root logger and keeps existing
    handler sinks, including pytest's caplog. Uvicorn's access logger is quieted
    because RequestLoggingMiddleware records each request and response preview.

    Args:
        settings (Settings): Validated process settings that control this component.
    """
    level = getattr(logging, settings.logging.level.upper(), logging.INFO)
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)
    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:
        root.addHandler(logging.StreamHandler())
    for handler in root.handlers:
        handler.setFormatter(formatter)
    logging.getLogger("api.request").setLevel(level)
    logging.getLogger("uvicorn").setLevel(level)
    logging.getLogger("uvicorn.error").setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
