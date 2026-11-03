"""audit stores the (redacted) task and response; base prompt versions record who published them

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("execution_audit", sa.Column("task_text", sa.Text))
    op.add_column("execution_audit", sa.Column("response_text", sa.Text))
    op.add_column("system_prompt_base", sa.Column("published_by", sa.String(255)))


def downgrade():
    op.drop_column("system_prompt_base", "published_by")
    op.drop_column("execution_audit", "response_text")
    op.drop_column("execution_audit", "task_text")
