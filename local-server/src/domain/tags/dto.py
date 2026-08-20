from datetime import datetime

from pydantic import BaseModel, Field

from lib.dto_config import model_config


class TagUpsertDTO(BaseModel):
    description: str | None = Field(default=None, max_length=4096)
    model_config = model_config()


class TagDTO(BaseModel):
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    tab_count: int
    model_config = model_config()
