"""Schema (SQLAlchemy Core) and engine. Alembic migrations in src/migrations must match this.
PostgreSQL only (Supabase in every environment; a throwaway Postgres for tests)."""
import sys

from sqlalchemy import (
    JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, LargeBinary, MetaData, String, Table, Text,
    UniqueConstraint, create_engine, func, text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src import constants as config

metadata = MetaData()

USER_ID = String(255)  # OIDC "sub"

providers = Table(
    "providers", metadata,
    Column("id", String(32), primary_key=True),
    Column("name", String(100), nullable=False),
    Column("base_url", String(255), nullable=False),
    Column("is_active", Boolean, nullable=False, server_default=text("true")),
)

credentials = Table(
    "user_provider_credentials", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", USER_ID, nullable=False, index=True),
    Column("provider_id", String(32), ForeignKey("providers.id"), nullable=False),
    Column("encrypted_key", LargeBinary, nullable=False),
    Column("wrapped_dek", LargeBinary, nullable=False),
    Column("kek_id", String(64), nullable=False),
    Column("key_last4", String(4), nullable=False),
    Column("status", String(16), nullable=False),
    Column("validated_at", DateTime(timezone=True)),
    UniqueConstraint("user_id", "provider_id", name="uq_cred_user_provider"),
)

preferences = Table(
    "user_model_preferences", metadata,
    Column("user_id", USER_ID, primary_key=True),
    Column("provider_id", String(32), ForeignKey("providers.id"), nullable=False),
    Column("model_id", String(255), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

base_prompts = Table(
    "system_prompt_base", metadata,
    Column("id", Integer, primary_key=True),
    Column("version", Integer, nullable=False, unique=True),
    Column("content", JSON, nullable=False),  # [{"name", "text"}] keeps section order
    Column("protected_sections", JSON, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("is_current", Boolean, nullable=False, server_default=text("false")),
    Column("published_by", USER_ID),  # admin user id, or "cli" for manage.py
    Index("uq_base_current", "is_current", unique=True,
          postgresql_where=text("is_current")),
)

patches = Table(
    "user_prompt_patches", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", USER_ID, nullable=False, index=True),
    Column("version", Integer, nullable=False),
    Column("base_version", Integer, nullable=False),
    Column("patch_content", JSON, nullable=False),
    Column("is_active", Boolean, nullable=False, server_default=text("false")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    UniqueConstraint("user_id", "version", name="uq_patch_user_version"),
    Index("uq_patch_active", "user_id", unique=True,
          postgresql_where=text("is_active")),
)

audit = Table(
    "execution_audit", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", USER_ID, nullable=False, index=True),
    Column("provider_id", String(32), ForeignKey("providers.id"), nullable=False),
    Column("model_id", String(255), nullable=False),
    Column("base_version", Integer),
    Column("patch_version", Integer),
    Column("tokens_in", Integer),
    Column("tokens_out", Integer),
    Column("latency_ms", Integer),
    Column("status", String(32), nullable=False),
    Column("correlation_id", String(64), index=True),  # matches the 8-64 char ids the API accepts
    Column("task_text", Text),  # redacted, capped; admin-only via /admin/audit
    Column("response_text", Text),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

if not config.DATABASE_URL.startswith("postgresql+psycopg://"):
    sys.exit("DATABASE_URL must be a postgresql+psycopg:// URL (your Supabase session pooler). See .env.example.")
engine = create_engine(config.DATABASE_URL, pool_pre_ping=True, pool_size=config.DB_POOL_SIZE, max_overflow=5)


def upsert(conn, table, values, conflict_cols):
    ins = pg_insert(table).values(**values)
    update = {k: ins.excluded[k] for k in values if k not in conflict_cols}
    conn.execute(ins.on_conflict_do_update(index_elements=conflict_cols, set_=update))


def lock(conn, key):
    """Serialise writers on `key` for this transaction (patch versioning, base publishing)."""
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": key})
