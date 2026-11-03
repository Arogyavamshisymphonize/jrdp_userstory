from alembic import context

from src.components import database as db

with db.engine.connect() as connection:
    context.configure(connection=connection, target_metadata=db.metadata)
    with context.begin_transaction():
        context.run_migrations()
