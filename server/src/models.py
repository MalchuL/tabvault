"""Central SQLAlchemy ORM models for the local server."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, TypeAlias

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.ext.mutable import MutableComposite
from sqlalchemy.orm import DeclarativeBase, Mapped, composite, mapped_column, relationship

from lib.time import UtcDateTime, utc_now

BackupReason: TypeAlias = Literal["scheduled", "clear_library", "pre_replace_import"]
TombstoneType: TypeAlias = Literal["tab", "group", "tag", "property"]


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
        str: New UUID string suitable for a model primary key.
    """
    return str(uuid.uuid4())


tab_tags = Table(
    "tab_tags",
    Base.metadata,
    Column("tab_id", String(36), ForeignKey("tabs.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_name", String(256), ForeignKey("tags.name", ondelete="CASCADE"), primary_key=True),
)


class MutableFields(MutableComposite):
    """Track changes inside a dataclass composite as ordinary column updates."""

    def __setattr__(self, name: str, value: Any) -> None:
        """Notify the owning ORM record when a grouped value changes.

        Args:
            name (str): Composite field to replace.
            value (Any): Value assigned to that field.
        """
        object.__setattr__(self, name, value)
        self.changed()


@dataclass
class GroupDetails(MutableFields):
    """Details values persisted in the existing groups columns."""

    name: str = ""
    description: str = ""
    category: str = ""
    color: str | None = None


@dataclass
class GroupPlacement(MutableFields):
    """Placement values persisted in the existing groups columns."""

    position: float = 0


@dataclass
class GroupTimestamps(MutableFields):
    """Timestamps values persisted in the existing groups columns."""

    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


class Group(Base):
    """Persist group records with grouped mutable values.

    Physical columns and constraints remain unchanged; composites track field changes
    within the caller-owned transaction.
    """

    __table__ = Table(
        "groups",
        Base.metadata,
        Column("id", String(36), primary_key=True, default=uuid4, nullable=False),
        Column("name", String(200), nullable=False, key="_name"),
        Column("description", Text, default="", nullable=False, key="_description"),
        Column("category", String(128), index=True, nullable=False, key="_category"),
        Column("color", String(32), nullable=True, key="_color"),
        Column("position", Float, default=0, nullable=False, key="_position"),
        Column("created_at", UtcDateTime, default=utc_now, nullable=False, key="_created_at"),
        Column(
            "updated_at",
            UtcDateTime,
            default=utc_now,
            onupdate=utc_now,
            nullable=False,
            key="_updated_at",
        ),
    )
    id: Mapped[str]
    details: Mapped[GroupDetails] = composite(
        GroupDetails,
        __table__.c._name,
        __table__.c._description,
        __table__.c._category,
        __table__.c._color,
    )
    placement: Mapped[GroupPlacement] = composite(GroupPlacement, __table__.c._position)
    timestamps: Mapped[GroupTimestamps] = composite(
        GroupTimestamps, __table__.c._created_at, __table__.c._updated_at
    )


@dataclass
class TabContent(MutableFields):
    """Content values persisted in the existing tabs columns."""

    url: str = ""
    title: str = ""


@dataclass
class TabAnnotations(MutableFields):
    """Annotations values persisted in the existing tabs columns."""

    custom_properties: dict[str, Any] = field(default_factory=dict)


@dataclass
class TabPlacement(MutableFields):
    """Placement values persisted in the existing tabs columns."""

    group_id: str | None = None
    position: float = 0


@dataclass
class TabLifecycle(MutableFields):
    """Lifecycle values persisted in the existing tabs columns."""

    archived: bool = False
    archived_at: datetime | None = None
    hidden_until: datetime | None = None


@dataclass
class TabTimestamps(MutableFields):
    """Timestamps values persisted in the existing tabs columns."""

    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


class Tab(Base):
    """Persist tab records with grouped mutable values.

    Physical columns and constraints remain unchanged; composites track field changes
    within the caller-owned transaction.
    """

    __table__ = Table(
        "tabs",
        Base.metadata,
        Column("id", String(36), primary_key=True, default=uuid4, nullable=False),
        Column("url", Text, nullable=False, key="_url"),
        Column("title", String(1024), nullable=False, key="_title"),
        Column("custom_properties", JSON, default=dict, nullable=False, key="_custom_properties"),
        Column(
            "group_id",
            ForeignKey("groups.id", ondelete="SET NULL"),
            index=True,
            nullable=True,
            key="_group_id",
        ),
        Column("position", Float, default=0, nullable=False, key="_position"),
        Column("archived", Boolean, default=False, index=True, nullable=False, key="_archived"),
        Column("archived_at", UtcDateTime, nullable=True, key="_archived_at"),
        Column("hidden_until", UtcDateTime, index=True, nullable=True, key="_hidden_until"),
        Column("created_at", UtcDateTime, default=utc_now, nullable=False, key="_created_at"),
        Column(
            "updated_at",
            UtcDateTime,
            default=utc_now,
            onupdate=utc_now,
            nullable=False,
            key="_updated_at",
        ),
        CheckConstraint("NOT archived OR group_id IS NULL", name="archived_tabs_are_unassigned"),
    )
    id: Mapped[str]
    tags: Mapped[list[Tag]] = relationship(secondary=tab_tags, lazy="selectin")
    content: Mapped[TabContent] = composite(TabContent, __table__.c._url, __table__.c._title)
    annotations: Mapped[TabAnnotations] = composite(TabAnnotations, __table__.c._custom_properties)
    placement: Mapped[TabPlacement] = composite(
        TabPlacement, __table__.c._group_id, __table__.c._position
    )
    lifecycle: Mapped[TabLifecycle] = composite(
        TabLifecycle, __table__.c._archived, __table__.c._archived_at, __table__.c._hidden_until
    )
    timestamps: Mapped[TabTimestamps] = composite(
        TabTimestamps, __table__.c._created_at, __table__.c._updated_at
    )


class Tag(Base):
    """Persist case-insensitive tag metadata.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        name (Mapped[str]): Human-readable name of this record.
        description (Mapped[str | None]): Optional human-readable explanatory text.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
        updated_at (Mapped[datetime]): UTC instant at which the record was last changed.
    """

    __tablename__ = "tags"
    name: Mapped[str] = mapped_column(String(256, collation="NOCASE"), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now, onupdate=utc_now)


class Backup(Base):
    """Persist metadata for an on-disk portable backup.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[str]): Stable identifier for this record.
        path (Mapped[str]): Path to the stored asset or backup file.
        reason (Mapped[BackupReason]): Cause that triggered creation of the backup.
        size_bytes (Mapped[int]): Size of the stored file in bytes.
        created_at (Mapped[datetime]): UTC instant at which the record was created.
    """

    __tablename__ = "backups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    path: Mapped[str] = mapped_column(Text, unique=True)
    reason: Mapped[BackupReason] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)


class Tombstone(Base):
    """Prevent synchronized restoration of permanently deleted entities.

    SQLAlchemy maps this definition to the local relational schema. Services enforce lifecycle rules
    around the model, while repositories load and mutate it inside request-scoped transactions.

    Attributes:
        id (Mapped[int]): Stable identifier for this record.
        entity_type (Mapped[TombstoneType]): Type of deleted record protected by this tombstone.
        entity_id (Mapped[str]): Stable identifier of the related entity.
        deleted_at (Mapped[datetime]): UTC instant associated with deleted.
    """

    __tablename__ = "tombstones"
    __table_args__ = (UniqueConstraint("entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[TombstoneType] = mapped_column(String(24))
    entity_id: Mapped[str] = mapped_column(String(256))
    deleted_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)


class PropertyDefinition(Base):
    """Persist one named definition and its synchronization timestamp."""

    __tablename__ = "property_definitions"
    name: Mapped[str] = mapped_column(String(128), primary_key=True)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)


class LibraryMetadata(Base):
    """Identify the database schema and current authoritative library generation."""

    __tablename__ = "library_metadata"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=5)
    generation: Mapped[str] = mapped_column(String(36), default=uuid4)
