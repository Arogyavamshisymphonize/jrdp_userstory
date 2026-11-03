"""enable row level security on alembic_version too (Alembic creates it, so 0004 missed it)

Revision ID: 0006
Revises: 0005
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.execute("ALTER TABLE alembic_version DISABLE ROW LEVEL SECURITY")
