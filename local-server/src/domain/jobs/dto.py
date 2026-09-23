"""Durable job DTOs."""

from datetime import datetime
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel

from lib.dto_config import DTO, model_config

JobKind: TypeAlias = Literal["preview_capture", "search_reindex", "backup_restore"]
JobStatus: TypeAlias = Literal["pending", "running", "done", "failed"]


class JobQueuedDTO(BaseModel):
    """Identifier of a queued background job."""

    job_id: str
    model_config = model_config()


class JobDTO(DTO):
    """Durable background-job state."""

    id: str
    status: JobStatus
    progress: float
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime
