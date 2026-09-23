"""Runtime configuration and logging setup."""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load validated TabVault settings from environment variables.

    Attributes:
        api_prefix (str): URL prefix for API routes.
        host (str): Network interface on which the API listens.
        port (int): TCP port on which the API listens.
        api_key (str | None): Bearer key required for non-loopback access.
        data_dir (Path): Directory containing the local database and assets.
        database_url (str | None): URL used for database.
        cors_origins (list[str]): Allowed cross-origin request origins.
        log_level (str): Minimum log severity emitted by the server.
        preview_timeout_seconds (float): Timeout for fetching remote preview content.
        preview_max_html_bytes (int): Maximum HTML response size accepted for previews.
        preview_max_image_bytes (int): Maximum image response size accepted for previews.
        preview_max_total_bytes (int): Maximum aggregate response size accepted for previews.
        preview_allow_private_hosts (bool): Whether preview capture may access private network hosts.
        embedding_model (str): Sentence-transformer model used for semantic search.
        embedding_batch_size (int): Maximum number of tabs embedded per batch.
    """

    model_config = SettingsConfigDict(env_prefix="TABVAULT_", env_file=".env", extra="ignore")

    api_prefix: str = "/api/v1"
    host: str = "127.0.0.1"
    port: int = 47821
    api_key: str | None = None
    data_dir: Path = Field(default_factory=lambda: Path.home() / ".local/share/tabvault")
    database_url: str | None = None
    cors_origins: list[str] = ["*"]
    log_level: str = "INFO"
    preview_timeout_seconds: float = 12.0
    preview_max_html_bytes: int = 2_000_000
    preview_max_image_bytes: int = 5_000_000
    preview_max_total_bytes: int = 20_000_000
    preview_allow_private_hosts: bool = False
    embedding_model: str = "deepvk/USER-bge-m3"
    embedding_batch_size: int = 16

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

    @model_validator(mode="after")
    def validate_remote_auth(self) -> Settings:
        """Require authentication when listening beyond loopback.

        Returns:
            Settings: The validated settings instance for continued model validation.

        Raises:
            ValueError: The server binds beyond loopback without an API key.
        """
        if self.host not in {"127.0.0.1", "localhost", "::1"} and not self.api_key:
            raise ValueError("TABVAULT_API_KEY is required when binding beyond loopback")
        return self

    @property
    def effective_database_url(self) -> str:
        """Return the configured database URL or local SQLite default.

        Returns:
            str: Configured database URL, or the SQLite URL under ``data_dir``.
        """
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{self.data_dir / 'tabvault.sqlite3'}"

    @property
    def asset_dir(self) -> Path:
        """Return the directory used for captured preview assets.

        Returns:
            Path: Path under ``data_dir`` for captured preview assets.
        """
        return self.data_dir / "assets"

    @property
    def model_dir(self) -> Path:
        """Return the directory used for downloaded embedding models.

        Returns:
            Path: Path under ``data_dir`` for downloaded embedding models.
        """
        return self.data_dir / "models"


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

    Applies ``TABVAULT_LOG_LEVEL`` to the root logger and uses one readable line format
    for application, uvicorn, and Alembic messages. Existing handlers keep their sinks
    (including pytest's ``caplog``) and only receive the shared formatter. Call this
    again after Alembic migrations; Alembic's ini ``fileConfig`` can reset the root
    logger to WARNING and hide request access lines. Uvicorn's own access logger is
    quieted because ``RequestLoggingMiddleware`` already records every request and a
    response preview.

    Args:
        settings (Settings): Validated process settings that control this component.
    """
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
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
