"""Central SQLAlchemy ORM models for the local server."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, TypeAlias

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
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
    """Declarative base for every persisted model.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.
    """


def uuid4() -> str:
    """Return a random UUID string for model defaults.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Returns:
        str: Result produced by the operation described above.
    """
    return str(uuid.uuid4())


tab_tags = Table(
    "tab_tags",
    Base.metadata,
    Column("tab_id", String(36), ForeignKey("tabs.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_name", String(256), ForeignKey("tags.name", ondelete="CASCADE"), primary_key=True),
)


class Group(Base):
    """Persist a flat categorized tab group.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[str]): Stable identifier for this record.
        name (Mapped[str]): Typed name value carried by this object.
        description (Mapped[str]): Optional human-readable explanatory text.
        category (Mapped[str]): Free-form Group category, such as ``session`` or ``manual``.
        color (Mapped[str | None]): Typed color value carried by this object.
        position (Mapped[float]): Stable display position within the current Group or Unassigned
            section.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
        updated_at (Mapped[datetime]): UTC instant at which the record was last changed.
    """

    __tablename__ = "groups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(128), index=True)
    color: Mapped[str | None] = mapped_column(String(32))
    position: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Tab(Base):
    """Persist a saved browser tab and its archive state.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[str]): Stable identifier for this record.
        url (Mapped[str]): Original saved URL, preserved without canonicalization.
        title (Mapped[str]): Human-readable title.
        favicon_asset_id (Mapped[str | None]): Stable identifier of the related favicon asset.
        note (Mapped[str]): User-authored note stored with the Saved Tab.
        agent_review (Mapped[str]): Agent-authored review text stored with the Saved Tab.
        viewed (Mapped[bool]): Whether any equivalent occurrence has been viewed.
        group_id (Mapped[str | None]): Identifier of the containing Group, or ``None`` for
            Unassigned.
        position (Mapped[float]): Stable display position within the current Group or Unassigned
            section.
        archived (Mapped[bool]): Whether the record is outside the active library.
        archived_at (Mapped[datetime | None]): UTC instant at which the record entered the archive.
        hidden_until (Mapped[datetime | None]): Absolute UTC deadline before which the tab stays
            hidden.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
        updated_at (Mapped[datetime]): UTC instant at which the record was last changed.
        tags (Mapped[list[Tag]]): Tags associated with the Saved Tab.
    """

    __tablename__ = "tabs"
    # Ensure that archived tabs cannot belong to any group.
    # If a tab is archived (archived=True), its group_id must be NULL.
    __table_args__ = (
        CheckConstraint("NOT archived OR group_id IS NULL", name="archived_tabs_are_unassigned"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(1024))
    favicon_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL")
    )
    note: Mapped[str] = mapped_column(Text, default="")
    agent_review: Mapped[str] = mapped_column(Text, default="")
    viewed: Mapped[bool] = mapped_column(Boolean, default=False)
    group_id: Mapped[str | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), index=True
    )
    position: Mapped[float] = mapped_column(Float, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hidden_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    tags: Mapped[list[Tag]] = relationship(secondary=tab_tags, lazy="selectin")


class Tag(Base):
    """Persist case-insensitive tag metadata.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        name (Mapped[str]): Typed name value carried by this object.
        description (Mapped[str | None]): Optional human-readable explanatory text.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
        updated_at (Mapped[datetime]): UTC instant at which the record was last changed.
    """

    __tablename__ = "tags"
    name: Mapped[str] = mapped_column(String(256, collation="NOCASE"), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Asset(Base):
    """Persist metadata for a captured local asset file.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[str]): Stable identifier for this record.
        kind (Mapped[AssetKind]): Typed kind value carried by this object.
        path (Mapped[str]): Typed path value carried by this object.
        content_type (Mapped[str]): Typed content type value carried by this object.
        size_bytes (Mapped[int]): Typed size bytes value carried by this object.
        checksum (Mapped[str]): Typed checksum value carried by this object.
        source_url (Mapped[str | None]): URL used for source.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
    """

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
    """Persist sanitized preview content for a tab.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        tab_id (Mapped[str]): Stable identifier of the related tab.
        status (Mapped[PreviewStatus]): Current lifecycle or readiness state.
        title (Mapped[str | None]): Human-readable title.
        byline (Mapped[str | None]): Typed byline value carried by this object.
        site_name (Mapped[str | None]): Typed site name value carried by this object.
        excerpt (Mapped[str | None]): Typed excerpt value carried by this object.
        content_html (Mapped[str | None]): Typed content html value carried by this object.
        length (Mapped[int]): Typed length value carried by this object.
        source_url (Mapped[str | None]): URL used for source.
        error (Mapped[str | None]): Typed error value carried by this object.
        fetched_at (Mapped[datetime | None]): UTC instant associated with fetched.
    """

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
    """Persist a local background job and its result.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[str]): Stable identifier for this record.
        kind (Mapped[JobKind]): Typed kind value carried by this object.
        target_id (Mapped[str | None]): Stable identifier of the related target.
        status (Mapped[JobStatus]): Current lifecycle or readiness state.
        progress (Mapped[float]): Typed progress value carried by this object.
        result (Mapped[dict[str, Any] | None]): Typed result value carried by this object.
        error (Mapped[str | None]): Typed error value carried by this object.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
        updated_at (Mapped[datetime]): UTC instant at which the record was last changed.
    """

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
    """Persist metadata for an on-disk portable backup.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[str]): Stable identifier for this record.
        path (Mapped[str]): Typed path value carried by this object.
        reason (Mapped[BackupReason]): Typed reason value carried by this object.
        size_bytes (Mapped[int]): Typed size bytes value carried by this object.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
    """

    __tablename__ = "backups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    path: Mapped[str] = mapped_column(Text, unique=True)
    reason: Mapped[BackupReason] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Tombstone(Base):
    """Prevent synchronized restoration of permanently deleted entities.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[int]): Stable identifier for this record.
        entity_type (Mapped[TombstoneType]): Typed entity type value carried by this object.
        entity_id (Mapped[str]): Stable identifier of the related entity.
        deleted_at (Mapped[datetime]): UTC instant associated with deleted.
    """

    __tablename__ = "tombstones"
    __table_args__ = (UniqueConstraint("entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[TombstoneType] = mapped_column(String(24))
    entity_id: Mapped[str] = mapped_column(String(256))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class HealthSchedule(Base):
    """Persist singleton vector-index health scheduling state.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[int]): Stable identifier for this record.
        interval_seconds (Mapped[int]): Typed interval seconds value carried by this object.
        notify_on_needs_attention (Mapped[bool]): Typed notify on needs attention value carried by
            this object.
        last_check (Mapped[datetime | None]): Typed last check value carried by this object.
        last_result (Mapped[HealthResult | None]): Typed last result value carried by this object.
        last_alert (Mapped[datetime | None]): Typed last alert value carried by this object.
    """

    __tablename__ = "health_schedule"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    interval_seconds: Mapped[int] = mapped_column(Integer, default=0)
    notify_on_needs_attention: Mapped[bool] = mapped_column(Boolean, default=False)
    last_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_result: Mapped[HealthResult | None] = mapped_column(String(32))
    last_alert: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
