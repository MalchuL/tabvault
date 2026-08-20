from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
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
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()] or ["*"]
        return value

    @model_validator(mode="after")
    def validate_remote_auth(self) -> Settings:
        if self.host not in {"127.0.0.1", "localhost", "::1"} and not self.api_key:
            raise ValueError("TABVAULT_API_KEY is required when binding beyond loopback")
        return self

    @property
    def effective_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{self.data_dir / 'tabvault.sqlite3'}"

    @property
    def asset_dir(self) -> Path:
        return self.data_dir / "assets"

    @property
    def model_dir(self) -> Path:
        return self.data_dir / "models"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def configure_logging(settings: Settings) -> None:
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
