# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## Overview

wild-life-api is a FastAPI service. Wild Life — single-user CRM/Calendar/Journal/Planner backend.

## Commands

```bash
uv sync                     # Install dependencies
uv run wild-life              # Run service (port 9005)
uv run pytest tests/ -v     # Run tests
uv run ruff check .         # Lint
uv run ruff format .        # Format
```

## Architecture

Layered FastAPI + SQLAlchemy 2.0 (async) service, backed by the shared Wild PC
postgres. All tables live in an isolated Postgres schema **`wild_life`**.

- `config.py` — pydantic-settings, env prefix `WILD_LIFE_`. Note the token
  field is `token` (→ env `WILD_LIFE_TOKEN`) because the prefix is applied to
  the field name.
- `db/base.py` — `Base` with `MetaData(schema="wild_life")` (schema-binds every
  table). `db/session.py` — async engine + `get_session` dep (commits on success).
- `auth.py` — **pure-ASGI** `BearerAuthMiddleware` (not BaseHTTPMiddleware, which
  breaks async SQLAlchemy). Runs before routing; `/health` + docs are open;
  `OPTIONS` (CORS preflight) passes through.
- **All datetime columns use `DateTime(timezone=True)`** —
  asyncpg rejects tz-aware values into naive columns.
- `schemas/` — Pydantic v2 Create/Update/Read per module (Read = `from_attributes`);
  shared enums + `Entity` base in `common.py`.
- `main.py` — wires auth + CORS middleware and includes every router.

## Database & migrations (Alembic)

Tables are in schema `wild_life` on the Wild PC db (`localhost:5432/castle`).
The app uses the **async** DSN (`postgresql+asyncpg://…`); Alembic uses the
**sync** DSN (`+psycopg`, derived in `migrations/env.py`). `env.py` also creates
the schema and filters autogenerate to `wild_life` only (`include_name`) so it
never touches `public`.

```bash
export WILD_LIFE_DATABASE_URL="postgresql+asyncpg://castle:$(wildpc secret get POSTGRES_PASSWORD)@localhost:5432/castle"
uv run alembic revision --autogenerate -m "describe change"   # after model edits
uv run alembic upgrade head
```

## Configuration

Environment variables (`WILD_LIFE_` prefix), supplied in production by the
Wild PC deployment's `defaults.env`:
- `WILD_LIFE_PORT` (default 9005), `WILD_LIFE_DATA_DIR`, `WILD_LIFE_HOST`
- `WILD_LIFE_DATABASE_URL` — async DSN to Wild PC postgres
- `WILD_LIFE_TOKEN` — bearer token every request must present (`${secret:WILD_LIFE_TOKEN}`)
- `WILD_LIFE_CORS_ORIGINS` — comma-separated allowed browser origins

## Deploy

`wildpc apply wild-life-api` (systemd service, gateway route). Live at
`https://wild-life-api.civil.payne.io`. Extend by adding a model + schema + router
(compose `crud_router`), a migration, then `wildpc apply`.
