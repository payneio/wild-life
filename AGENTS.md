# personal

## Overview

A single-user life-management app — CRM / Calendar / Journal / Planner. One
person's system for areas, programs, projects, tasks, people, routines, goals,
metrics, notes, health, and reviews. This is a monorepo: a FastAPI backend
(`api/`) and a React SPA (`web/`), deployed together by [castle](https://github.com/payneio/castle).

It was previously two repos (`personal` + `personal-api`); their histories are
preserved here under `web/` and `api/`.

## Structure

| Path   | What            | Stack                                             | Castle program |
| ------ | --------------- | ------------------------------------------------- | -------------- |
| `api/` | HTTP API + data | FastAPI, SQLAlchemy 2.0 async, Postgres, Alembic  | `personal-api` |
| `web/` | Frontend SPA    | React 19, Vite 7, TanStack Query, Tailwind v4, react-router 7 | `personal`     |

- **`api/`** — the authoritative model and REST surface. Read **@api/CLAUDE.md**
  before non-trivial backend work: it documents the Area→Program→Project→Task
  hierarchy, every entity/router, the pure-ASGI bearer auth, the isolated
  `personal_api` Postgres schema, and Alembic migrations.
- **`web/`** — talks to the API over HTTP + one SSE stream. Base URL from
  `VITE_API_BASE_URL` (dev `.env` → `http://localhost:9005`; `.env.production` →
  the deployed API). Bearer token lives in `localStorage` (`personal_api_token`).

## Develop

```bash
# backend — http://localhost:9005
cd api
uv sync
uv run personal-api                 # run the service
uv run pytest tests/ -v             # tests (needs the castle Postgres)
uv run ruff check . && uv run ruff format .
uv run alembic revision --autogenerate -m "..."   # after model edits
uv run alembic upgrade head

# frontend — http://localhost:5173
cd web
pnpm install
pnpm dev
pnpm build                          # tsc -b && vite build  (must pass before deploy)
pnpm lint
```

## Architecture worth knowing

- **SSE-driven reactivity.** Frontend mutations do **not** invalidate the query
  cache themselves (`web/src/services/api/crud.ts`). Every write lands in the
  backend `change_log`, fans out over Postgres `LISTEN/NOTIFY`, and a single
  app-wide SSE stream (`web/src/services/api/live.ts` ↔ `api/.../routers/stream.py`)
  triggers a global React Query invalidation. Your own edits and external edits
  travel the same path — so a new page stays live just by using normal hooks.
- **Three notes scopes, one component + one table.** `web/src/pages/NotesPage.tsx`
  backs **Journal** (`/notes`), **Work Journal** (`/work-journal`), and
  **Whiteboard** (`/whiteboard`), discriminated by tags on the shared `notes`
  table: Work = notes tagged `work:microsoft`, Whiteboard = tagged `whiteboard`,
  Journal = notes with *neither* (uses the repeatable `no_tag` query param on
  `/notes` + `/notes/calendar`). Keep the three disjoint when touching this.
- **Generic CRUD.** Most backend routers compose `crud_router` factory
  (`api/.../routers/crud.py`); the frontend mirrors it with `createCrud`
  (`web/src/services/api/crud.ts`) + a registry (`web/src/services/api/registry.ts`).
  Add an entity by extending both, not by hand-writing a bespoke stack.

## Deploy

Two castle programs point at the subdirectories (manifests in
`~/.castle/programs/personal-api.yaml` and `personal.yaml`):

```bash
castle apply personal-api   # systemd service on :9005 → https://personal-api.civil.payne.io
castle apply personal       # pnpm build → web/dist, served by the caddy gateway → https://personal.civil.payne.io
```

The `personal` static build runs `pnpm build` but not `pnpm install`, so keep
`web/node_modules` present (run `pnpm install` after a clean checkout before the
first `castle apply personal`). Backend data dir and secrets are supplied by the
systemd unit (`PERSONAL_API_*` env), not from files in this repo.

## Conventions

- Match the surrounding code's style, naming, and comment density in each subdir.
- A global git `commit-msg` hook rejects any commit message mentioning "claude".
- Backend datetime columns are all tz-aware (`DateTime(timezone=True)`); statuses
  are `Literal`-validated Text — see @api/CLAUDE.md.
