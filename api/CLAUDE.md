# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## Overview

personal-api is a FastAPI service. Personal API — single-user CRM/Calendar/Journal/Planner backend.

## Commands

```bash
uv sync                     # Install dependencies
uv run personal-api              # Run service (port 9005)
uv run pytest tests/ -v     # Run tests
uv run ruff check .         # Lint
uv run ruff format .        # Format
```

## Architecture

Layered FastAPI + SQLAlchemy 2.0 (async) service, backed by the shared castle
postgres. All tables live in an isolated Postgres schema **`personal_api`**.

- `config.py` — pydantic-settings, env prefix `PERSONAL_API_`. Note the token
  field is `token` (→ env `PERSONAL_API_TOKEN`) because the prefix is applied to
  the field name.
- `db/base.py` — `Base` with `MetaData(schema="personal_api")` (schema-binds every
  table). `db/session.py` — async engine + `get_session` dep (commits on success).
- `auth.py` — **pure-ASGI** `BearerAuthMiddleware` (not BaseHTTPMiddleware, which
  breaks async SQLAlchemy). Runs before routing; `/health` + docs are open;
  `OPTIONS` (CORS preflight) passes through.
- `models/` — grouped modules for the life-management model: `core` (Area/Program/
  Project), `tasks`, `people` (Person/Interaction), `routines` (Routine/Instance),
  `goals` (Goal + GoalProject link), `metrics` (Metric/Entry), `calendar` (Event),
  `notes` (Note), `tracking` (Commitment/WaitingItem/Delegation), `reviews`,
  `knowledge` (Resource/Decision), `tags` (Tag + EntityTag). `mixins.py` gives uuid
  PK + tz-aware created/updated. **All datetime columns use `DateTime(timezone=True)`**
  — asyncpg rejects tz-aware values into naive columns. Statuses are Text columns
  validated by `Literal`s in `schemas/common.py`. Cross-entity links to
  area/program/project are typed FKs; `entity_type`/`entity_id` are *soft*
  polymorphic links (no FK) used by notes/resources/decisions/tags/delegations.
- `schemas/` — Pydantic v2 Create/Update/Read per module (Read = `from_attributes`);
  shared enums + `Entity` base in `common.py`.
- `routers/crud.py` — generic CRUD-router factory; most routers compose one per
  resource. Custom logic: `tasks` (personal vs delegated `queue`, recurring-task
  next-occurrence, completed_at), `routines` (`/routines/{id}/complete` logs an
  instance), `goals` (project links + `/computed-progress`), `reviews`
  (`GET /review-dashboard` — the neglect/drift/overdue/ownership detector),
  `tags` (`/attach`, `/entity-tags`), `notes`/`people`/`metrics` (filters + nested).
- `main.py` — wires auth + CORS middleware and includes every router.

Full product spec (entities, statuses, rules) provided by the user; the primary
hierarchy is **Area → optional Program → Project → Task**, with supporting entities
for goals, routines, metrics, delegation, commitments, waiting items, reviews, etc.

## Database & migrations (Alembic)

Tables are in schema `personal_api` on the castle db (`localhost:5432/castle`).
The app uses the **async** DSN (`postgresql+asyncpg://…`); Alembic uses the
**sync** DSN (`+psycopg`, derived in `migrations/env.py`). `env.py` also creates
the schema and filters autogenerate to `personal_api` only (`include_name`) so it
never touches `public`.

```bash
export PERSONAL_API_DATABASE_URL="postgresql+asyncpg://castle:$(castle secret get POSTGRES_PASSWORD)@localhost:5432/castle"
uv run alembic revision --autogenerate -m "describe change"   # after model edits
uv run alembic upgrade head
```

## Configuration

Environment variables (`PERSONAL_API_` prefix), supplied in production by the
castle deployment's `defaults.env`:
- `PERSONAL_API_PORT` (default 9005), `PERSONAL_API_DATA_DIR`, `PERSONAL_API_HOST`
- `PERSONAL_API_DATABASE_URL` — async DSN to castle postgres
- `PERSONAL_API_TOKEN` — bearer token every request must present (`${secret:PERSONAL_API_TOKEN}`)
- `PERSONAL_API_CORS_ORIGINS` — comma-separated allowed browser origins

## Deploy

`castle apply personal-api` (systemd service, gateway route). Live at
`https://personal-api.civil.payne.io`. Extend by adding a model + schema + router
(compose `crud_router`), a migration, then `castle apply`.
