"""Vector indexing DTOs."""

from datetime import datetime
from typing import Literal, TypeAlias

from pydantic import BaseModel, Field

from domain.system.dto import VectorStatusDTO
from lib.dto_config import DTO, model_config

HealthResult: TypeAlias = Literal["ready", "needs_attention"]


class HealthConfigDTO(BaseModel):
    """Recurring vector-health configuration."""

    interval_seconds: int = Field(ge=0, le=86400)
    notify_on_needs_attention: bool | None = None
    model_config = model_config()


class HealthScheduleDTO(DTO):
    """Persisted vector-health schedule state."""

    enabled: bool
    interval_seconds: int
    notify_on_needs_attention: bool
    last_check: datetime | None
    last_result: HealthResult | None
    last_alert: datetime | None


class IndexStatusDTO(VectorStatusDTO):
    """Vector status with health scheduling state."""

    health_check: HealthScheduleDTO
