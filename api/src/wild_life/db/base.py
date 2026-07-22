"""Declarative base — all tables live in the ``wild_life`` schema."""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from wild_life.config import DB_SCHEMA


class Base(DeclarativeBase):
    """Base class for all ORM models.

    Binding the schema to ``MetaData`` makes every table land in
    ``wild_life`` and makes Alembic emit schema-qualified DDL, keeping our
    tables isolated from anything else in the shared ``castle`` database.
    """

    metadata = MetaData(schema=DB_SCHEMA)
