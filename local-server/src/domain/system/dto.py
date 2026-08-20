from typing import Literal

from pydantic import BaseModel, Field

from lib.dto_config import model_config


class HealthConfigDTO(BaseModel):
    interval_seconds: int = Field(ge=0, le=86400)
    notify_on_needs_attention: bool | None = None
    model_config = model_config()


class ImportEnvelopeDTO(BaseModel):
    mode: Literal["upload", "replace"]
    format: Literal["json", "markdown"]
    content: object
    model_config = model_config()
