"""enable row level security on every table (Supabase exposes the public schema through its Data API)

No policies: Supabase's anon/authenticated roles see nothing. The app connects as the table owner,
which bypasses RLS, so it is unaffected.

Revision ID: 0004
Revises: 0003
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

TABLES = ("providers", "user_provider_credentials", "user_model_preferences", "system_prompt_base",
          "user_prompt_patches", "execution_audit")


def upgrade():
    for t in TABLES:
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")


def downgrade():
    for t in TABLES:
        op.execute(f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY")
