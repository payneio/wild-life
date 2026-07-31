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
- `models/moments.py` — **the spine.** A life is a series of moments; every other
  object is their subject rather than their owner. Read `docs/moments.md` before
  touching it: the kind vocabulary, the four link roles, and why tense is two
  column pairs rather than a status enum.
- `models/` — the standing things moments are about: `core` (Area/Program/Project),
  `tasks`, `people`, `organizations`, `locations`, `routines` (a cadence *and* a
  practice — see the caveat below), `outcomes`, `metrics` + `metric_groups`,
  `health`/`protocols` (Medication/Protocol/Allergy/InsurancePlan), `tracking`,
  `requests`, `reviews`, `knowledge` (Resource/Decision), `links`, `whiteboard`,
  `preferences`, `history`, `auth`, `push`. `mixins.py` gives uuid PK + tz-aware
  created/updated. **All datetime columns use `DateTime(timezone=True)`** —
  asyncpg rejects tz-aware values into naive columns. Statuses are Text columns
  validated by `Literal`s in `schemas/common.py`. Cross-entity links to
  area/program/project are typed FKs; `moment_links` is the soft polymorphic
  edge (`entity_type`/`entity_id`, no FK) because a moment may concern anything.
- `spine.py` — **every act writes its moment inline**, in the same transaction as
  the row the act wrote, so the timeline never lags the table it came from. Each
  derived moment is named after its source (`task:<id>:completion`) and
  `uq_moments_source_ref` allows one per name, so writing twice corrects rather
  than duplicates. The writers retract too: reopening a task deletes its
  completion. `crud_router` takes `on_write`/`on_delete` so a router cannot
  forget. The pre-inversion tables and the mirror that fed them are gone; their
  rows are in `migrations/legacy/*.csv`.
- `schemas/` — Pydantic v2 Create/Update/Read per module (Read = `from_attributes`);
  shared enums + `Entity` base in `common.py`.
- `routers/crud.py` — generic CRUD-router factory; most routers compose one per
  resource. Custom logic: `moments` (timeline by any end, `unfiled`, density rail,
  images), `occurrences` (**the one answer to "when does this happen"** —
  plain moments, untranslatable wire rules expanded from their calendar record,
  and our own rules projected but never stored; plus the scoped `this`/`following`/
  `all` edit), `tasks` (personal vs delegated `queue`, completed_at), `routines`
  (`/routines/{id}/complete`), `reviews` (`GET /review-dashboard` — the
  neglect/drift/overdue detector), `calendar_mail` (iMIP: invitations, RSVP,
  guests), `people`/`metrics` (filters + nested).
- `main.py` — wires auth + CORS middleware and includes every router.

The primary hierarchy is **Area → optional Program → Project → Task**; moments hang
off all of it by link rather than by ownership.

**`Routine` is one thing, not two.** A rule is a cadence that projects
occurrences, and `kind` says what those occurrences are — `occasion`, `dose`,
`activity` — exactly as `Moment.kind` names an act rather than an object. A
meeting series and a habit differ in what they generate, not in what they are,
which is why one expander answers for both. Splitting them would recreate the
four-answers-to-one-question the migration existed to remove.

What *was* wrong there was the label: it lived in `name` for some kinds and
`activity` for others, with every reader spelling `activity or name`, and
`activity` is a column named after one of `kind`'s values while holding meeting
titles for another. One column now (`name`), null for a dose, whose label is the
medication it schedules.

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
