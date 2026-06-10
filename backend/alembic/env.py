"""Async-aware Alembic environment for the hyperlocal chat backend.

- Pulls the DSN from app.core.config.get_settings() (.env)
- Imports app.models so MetaData reflects every table
- Filters out GeoAlchemy2's internal spatial_ref_sys / tiger / topology tables
  so autogenerate doesn't try to drop/recreate PostGIS internals
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings

# Import all models so Base.metadata is populated before autogenerate runs.
from app.db.base import Base
from app import models  # noqa: F401  (registers tables on Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the DSN at runtime from the app settings rather than alembic.ini.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


# Tables / schemas that PostGIS creates and Alembic should NEVER touch.
_POSTGIS_TABLES = {
    "spatial_ref_sys",
    "geography_columns",
    "geometry_columns",
    "raster_columns",
    "raster_overviews",
}
_IGNORED_SCHEMAS = {"tiger", "tiger_data", "topology"}


def include_object(object_, name, type_, reflected, compare_to):  # noqa: ANN001
    if type_ == "table" and name in _POSTGIS_TABLES:
        return False
    if hasattr(object_, "schema") and object_.schema in _IGNORED_SCHEMAS:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
