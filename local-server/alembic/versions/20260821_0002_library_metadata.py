"""Add review status and group descriptions."""

import sqlalchemy as sa

from alembic import op

revision = "20260821_0002"
down_revision = "20260821_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add non-null metadata fields while preserving existing records."""
    inspector = sa.inspect(op.get_bind())
    group_columns = {column["name"] for column in inspector.get_columns("groups")}
    tab_columns = {column["name"]: column for column in inspector.get_columns("tabs")}
    if "description" not in group_columns:
        op.add_column(
            "groups",
            sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
        )
    if "agent_review" not in tab_columns:
        op.add_column(
            "tabs",
            sa.Column("agent_review", sa.Text(), nullable=False, server_default=sa.text("''")),
        )
    if "viewed" not in tab_columns:
        op.add_column(
            "tabs",
            sa.Column("viewed", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if tab_columns["note"]["nullable"]:
        op.execute(sa.text("UPDATE tabs SET note = '' WHERE note IS NULL"))
    with op.batch_alter_table("groups") as batch:
        batch.alter_column(
            "description", existing_type=sa.Text(), nullable=False, server_default=sa.text("''")
        )
    with op.batch_alter_table("tabs") as batch:
        batch.alter_column(
            "note", existing_type=sa.Text(), nullable=False, server_default=sa.text("''")
        )
        batch.alter_column(
            "agent_review", existing_type=sa.Text(), nullable=False, server_default=sa.text("''")
        )
        batch.alter_column(
            "viewed", existing_type=sa.Boolean(), nullable=False, server_default=sa.false()
        )


def downgrade() -> None:
    """Remove metadata fields and restore nullable notes."""
    with op.batch_alter_table("tabs") as batch:
        batch.alter_column("note", existing_type=sa.Text(), nullable=True, server_default=None)
        batch.drop_column("viewed")
        batch.drop_column("agent_review")
    op.drop_column("groups", "description")
