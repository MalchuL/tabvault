"""Create the fresh schema-v2 database."""

from alembic import op
from models import Base

revision = "20260823_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create every schema-v2 table."""
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    """Drop every schema-v2 table."""
    Base.metadata.drop_all(bind=op.get_bind())
