"""Alembic environment — targets the ``wild_life`` schema on castle postgres."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, text

from wild_life.config import DB_SCHEMA, settings
from wild_life.db.base import Base

# Import all models so Base.metadata is fully populated for autogenerate.
import wild_life.models  # noqa: F401,E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    """Restrict autogenerate to our own schema (never touch public/others).

    Underscore-prefixed tables are a migration's own bookkeeping — a revision
    keeping what it needs to undo itself — and have no model by design. Without
    this, `alembic check` would demand a drop for every one of them and stop
    meaning anything.
    """
    if type_ == "schema":
        return name == DB_SCHEMA
    if type_ == "table" and name is not None and name.startswith("_"):
        return False
    return True


def run_migrations_online() -> None:
    """Run migrations against a live (sync psycopg) connection."""
    engine = create_engine(settings.sync_database_url, future=True)
    with engine.connect() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {DB_SCHEMA}"))
        connection.execute(text(f"SET search_path TO {DB_SCHEMA}, public"))
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema=DB_SCHEMA,
            include_schemas=True,
            include_name=include_name,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline migrations are not supported for wild-life-api.")
else:
    run_migrations_online()
