"""Declarative base — all tables live in the ``personal_api`` schema."""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from personal_api.config import DB_SCHEMA


class Base(DeclarativeBase):
    """Base class for all ORM models.

    Binding the schema to ``MetaData`` makes every table land in
    ``personal_api`` and makes Alembic emit schema-qualified DDL, keeping our
    tables isolated from anything else in the shared ``castle`` database.
    """

    metadata = MetaData(schema=DB_SCHEMA)
