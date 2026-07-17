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

## From a code change to live

Iterate with the dev servers; they never touch the live URLs. Publish separately.
`castle` builds in place from this working tree (each `source:` is a path into
`/data/repos/personal`), so publishing needs no commit or push.

- **Iterate.** `pnpm dev` (web, :5173) hot-reloads. `uv run personal-api` (API,
  :9005) has no autoreload — restart it after backend edits. `pnpm dev` talks to
  whatever `VITE_API_BASE_URL` names; `web/.env.development.local` defaults it to the
  deployed API.
- **Publish web** → `castle program build personal` (or `pnpm build`). Caddy serves
  `web/dist/` in place, so rebuilding `dist/` *is* the deploy. `castle apply` does
  **not** build — only run it when the route or manifest changes.
- **Publish API** → the package is installed editable, so the service imports source
  directly: a code-only change just needs `castle service restart personal-api`. Run
  `castle apply personal-api` when deps or env changed (it does `uv sync` + reconcile
  + restart).
- **Schema change** → run `alembic upgrade head` against the castle db yourself
  first; nothing runs migrations for you.

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

## Deploy & operate (castle)

This box runs [castle](https://github.com/payneio/castle) (`/data/repos/castle`,
CLI: `castle`). It builds, runs, routes, and supervises every app on the machine
from source. You don't hand-write systemd units, Caddy routes, or env files —
you edit **manifests** and run `castle apply`, which renders and reconciles the
running system. Full model + docs: `/data/repos/castle/AGENTS.md`.

### The two layers (where this app is declared)

Castle splits each app into *what it is* (program) and *how it runs here*
(deployment). Both live under `~/.castle/`, keyed by program name:

| File | Role | This app |
| ---- | ---- | -------- |
| `~/.castle/programs/personal-api.yaml` | catalog: `source`, `stack`, build | `source: /data/repos/personal/api`, `stack: python-fastapi` |
| `~/.castle/programs/personal.yaml` | catalog for the web app | `source: /data/repos/personal/web`, `stack: react-vite`, build `pnpm build → dist/` |
| `~/.castle/deployments/services/personal-api.yaml` | run as a **systemd service** | `manager: systemd`, port 9005, health `/health`, `requires: postgres`, env below |
| `~/.castle/deployments/statics/personal.yaml` | serve built SPA via **caddy** | `manager: caddy`, `root: dist`, `requires: personal-api` |

The service manifest's `defaults.env` is where the backend's config comes from
(not files in this repo). It uses castle templating — `${port}`, `${data_dir}`,
and `${secret:NAME}` (resolved from the OpenBao secret backend):

```yaml
PERSONAL_API_PORT: ${port}
PERSONAL_API_DATA_DIR: ${data_dir}
PERSONAL_API_DATABASE_URL: postgresql+asyncpg://castle:${secret:POSTGRES_PASSWORD}@localhost:5432/castle
PERSONAL_API_TOKEN: ${secret:PERSONAL_API_TOKEN}
PERSONAL_API_CORS_ORIGINS: https://personal.civil.payne.io
```

Rendered artifacts (do not edit by hand — regenerated on apply): the systemd unit
`castle-personal-api.service` (a **user** service: `systemctl --user …`), its env
file `~/.castle/secrets/env/castle-personal-api.service.env`, and the gateway
routes in `~/.castle/artifacts/specs/Caddyfile`. Live URLs go through the caddy
gateway (`civil.payne.io`, exposed via a cloudflared tunnel):
`https://personal-api.civil.payne.io` and `https://personal.civil.payne.io`.

### Everyday commands

```bash
castle apply --plan             # dry-run: show what would change (do this first)
castle apply personal-api       # build + (re)start the API service from api/
castle apply personal           # publish/refresh the caddy route (does NOT build dist)
castle apply                    # converge everything

castle status                   # health of all deployments
castle list --kind service      # what's registered
castle service logs personal-api        # tail API logs  (also: journalctl --user -u castle-personal-api.service)
castle service restart personal-api     # imperative bounce (no rebuild)
castle program info personal-api        # resolved manifest + paths
castle program build|test|lint|check personal-api   # run the stack's commands
castle doctor                   # diagnose setup/runtime; castle graph shows relationships
```

Secrets live in the OpenBao backend, never in the repo:

```bash
castle secret list
castle secret get PERSONAL_API_TOKEN      # e.g. to auth a curl against :9005
castle secret set PERSONAL_API_TOKEN      # prompts for value
```

### Making common changes

- **Code change** → see [From a code change to live](#from-a-code-change-to-live):
  web is `castle program build personal`, API is `castle service restart personal-api`.
  Builds run from this working tree (not a git ref), so no commit is needed.
- **Backend env / new setting** → edit `deployments/services/personal-api.yaml`
  `defaults.env`, then `castle apply personal-api`.
- **New secret** → `castle secret set NAME`, reference it as `${secret:NAME}` in
  the manifest env, `castle apply`.
- **Change a port / route / CORS** → edit the deployment manifest (`expose.http`,
  `reach`) and/or the CORS env line, `castle apply`.
- **Gotcha:** the `personal` static build runs `pnpm build` but *not*
  `pnpm install`. After a clean checkout, run `pnpm install` in `web/` once
  before the first `castle apply personal`, or `dist/` won't be produced.

## Conventions

- Match the surrounding code's style, naming, and comment density in each subdir.
- A global git `commit-msg` hook rejects any commit message mentioning "claude".
- Backend datetime columns are all tz-aware (`DateTime(timezone=True)`); statuses
  are `Literal`-validated Text — see @api/CLAUDE.md.
