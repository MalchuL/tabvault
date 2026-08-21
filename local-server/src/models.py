"""Central SQLAlchemy ORM models for the local server."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, TypeAlias

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from lib.time import utc_now

AssetKind: TypeAlias = Literal["image", "icon"]
PreviewStatus: TypeAlias = Literal["pending", "running", "ready", "unavailable"]
JobKind: TypeAlias = Literal["preview_capture", "search_reindex", "backup_restore"]
JobStatus: TypeAlias = Literal["pending", "running", "done", "failed"]
BackupReason: TypeAlias = Literal["scheduled", "clear_library", "pre_replace_import"]
TombstoneType: TypeAlias = Literal["tab", "group"]
HealthResult: TypeAlias = Literal["ready", "needs_attention"]


class Base(DeclarativeBase):
    """Declarative base for every persisted model."""


def uuid4() -> str:
    """Return a random UUID string for model defaults."""
    return str(uuid.uuid4())


tab_tags = Table(
    "tab_tags",
    Base.metadata,
    Column("tab_id", String(36), ForeignKey("tabs.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_name", String(256), ForeignKey("tags.name", ondelete="CASCADE"), primary_key=True),
)


class Group(Base):
    """Persist a hierarchical tab group."""

    __tablename__ = "groups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("groups.id", ondelete="SET NULL"))
    color: Mapped[str | None] = mapped_column(String(32))
    position: Mapped[float] = mapped_column(Float, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Tab(Base):
    """Persist a saved browser tab and its archive state."""

    __tablename__ = "tabs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    url: Mapped[str] = mapped_column(Text)
    normalized_url: Mapped[str] = mapped_column(Text, index=True)
    title: Mapped[str] = mapped_column(String(1024))
    favicon_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
    group_id: Mapped[str | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), index=True
    )
    position: Mapped[float] = mapped_column(Float, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    tags: Mapped[list[Tag]] = relationship(secondary=tab_tags, lazy="selectin")


class Tag(Base):
    """Persist case-insensitive tag metadata."""

    __tablename__ = "tags"
    name: Mapped[str] = mapped_column(String(256, collation="NOCASE"), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Asset(Base):
    """Persist metadata for a captured local asset file."""

    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    kind: Mapped[AssetKind] = mapped_column(String(16), index=True)
    path: Mapped[str] = mapped_column(Text, unique=True)
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String(64), unique=True)
    source_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Preview(Base):
    """Persist sanitized preview content for a tab."""

    __tablename__ = "previews"
    tab_id: Mapped[str] = mapped_column(ForeignKey("tabs.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[PreviewStatus] = mapped_column(String(24), default="pending")
    title: Mapped[str | None] = mapped_column(String(1024))
    byline: Mapped[str | None] = mapped_column(String(1024))
    site_name: Mapped[str | None] = mapped_column(String(512))
    excerpt: Mapped[str | None] = mapped_column(Text)
    content_html: Mapped[str | None] = mapped_column(Text)
    length: Mapped[int] = mapped_column(Integer, default=0)
    source_url: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Job(Base):
    """Persist a local background job and its result."""

    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    kind: Mapped[JobKind] = mapped_column(String(32), index=True)
    target_id: Mapped[str | None] = mapped_column(String(36), index=True)
    status: Mapped[JobStatus] = mapped_column(String(16), default="pending", index=True)
    progress: Mapped[float] = mapped_column(Float, default=0)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Backup(Base):
    """Persist metadata for an on-disk portable backup."""

    __tablename__ = "backups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    path: Mapped[str] = mapped_column(Text, unique=True)
    reason: Mapped[BackupReason] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class IdempotencyRecord(Base):
    """Persist a replayable POST response for one idempotency key."""

    __tablename__ = "idempotency_keys"
    key: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response: Mapped[dict[str, Any]] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Tombstone(Base):
    """Prevent synchronized restoration of permanently deleted entities."""

    __tablename__ = "tombstones"
    __table_args__ = (UniqueConstraint("entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[TombstoneType] = mapped_column(String(24))
    entity_id: Mapped[str] = mapped_column(String(256))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class HealthSchedule(Base):
    """Persist singleton vector-index health scheduling state."""

    __tablename__ = "health_schedule"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    interval_seconds: Mapped[int] = mapped_column(Integer, default=0)
    notify_on_needs_attention: Mapped[bool] = mapped_column(Boolean, default=False)
    last_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_result: Mapped[HealthResult | None] = mapped_column(String(32))
    last_alert: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
