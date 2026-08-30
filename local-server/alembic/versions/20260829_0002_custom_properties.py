"""Move viewed into schema-driven Custom Properties."""

from __future__ import annotations

import json

import sqlalchemy as sa

from alembic import op

revision = "20260829_0002"
down_revision = "20260823_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the singleton schema and migrate every dedicated viewed value.

    The baseline migration imports current metadata, so fresh databases may already contain the
    new table and column. Inspection keeps this incremental revision safe for both fresh and
    existing schema-v2 databases.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "property_schemas" not in tables:
        op.create_table(
            "property_schemas",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("properties", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    tab_columns = {column["name"] for column in sa.inspect(bind).get_columns("tabs")}
    if "custom_properties" not in tab_columns:
        op.add_column("tabs", sa.Column("custom_properties", sa.JSON(), nullable=True))
    tab_columns = {column["name"] for column in sa.inspect(bind).get_columns("tabs")}
    if "viewed" in tab_columns:
        rows = bind.execute(sa.text("SELECT id, viewed FROM tabs")).mappings()
        for row in rows:
            bind.execute(
                sa.text("UPDATE tabs SET custom_properties = :value WHERE id = :id"),
                {"id": row["id"], "value": json.dumps({"viewed": bool(row["viewed"])})},
            )
        with op.batch_alter_table("tabs") as batch:
            batch.drop_column("viewed")
    bind.execute(
        sa.text(
            "INSERT INTO property_schemas (id, properties, updated_at) "
            "SELECT 1, :properties, CURRENT_TIMESTAMP "
            "WHERE NOT EXISTS (SELECT 1 FROM property_schemas WHERE id = 1)"
        ),
        {"properties": json.dumps({})},
    )
    bind.execute(
        sa.text("UPDATE tabs SET custom_properties = '{}' WHERE custom_properties IS NULL")
    )
    with op.batch_alter_table("tabs") as batch:
        batch.alter_column("custom_properties", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    """Restore the dedicated viewed column from the custom-property override or default."""
    bind = op.get_bind()
    tab_columns = {column["name"] for column in sa.inspect(bind).get_columns("tabs")}
    if "viewed" not in tab_columns:
        op.add_column("tabs", sa.Column("viewed", sa.Boolean(), nullable=True))
    rows = bind.execute(sa.text("SELECT id, custom_properties FROM tabs")).mappings()
    for row in rows:
        raw = row["custom_properties"]
        values = json.loads(raw) if isinstance(raw, str) else raw or {}
        bind.execute(
            sa.text("UPDATE tabs SET viewed = :viewed WHERE id = :id"),
            {"id": row["id"], "viewed": bool(values.get("viewed", False))},
        )
    with op.batch_alter_table("tabs") as batch:
        batch.alter_column("viewed", nullable=False)
        batch.drop_column("custom_properties")
    op.drop_table("property_schemas")
