# Wild Life

## Overview

A single-user life-management app — CRM / Calendar / Journal / Planner. One
person's system for areas, programs, projects, tasks, people, routines, goals,
metrics, notes, health, and reviews. This is a monorepo: a FastAPI backend
(`api/`) and a React SPA (`web/`), deployed together by [Wild PC](https://github.com/payneio/castle).

It was previously two separate repos (web and API); their histories are
preserved here under `web/` and `api/`.

## Structure

| Path   | What            | Stack                                             | Wild PC program |
| ------ | --------------- | ------------------------------------------------- | -------------- |
| `api/` | HTTP API + data | FastAPI, SQLAlchemy 2.0 async, Postgres, Alembic  | `wild-life-api` |
| `web/` | Frontend SPA    | React 19, Vite 7, TanStack Query, Tailwind v4, react-router 7 | `wild-life`     |

- **`api/`** — the authoritative model and REST surface. Read **@api/CLAUDE.md**
  before non-trivial backend work: it documents the Area→Program→Project→Task
  hierarchy, every entity/router, the pure-ASGI bearer auth, the isolated
  `wild_life` Postgres schema, and Alembic migrations.
- **`web/`** — talks to the API over HTTP + one SSE stream. Base URL from
  `VITE_API_BASE_URL` (dev `.env` → `http://localhost:9005`; `.env.production` →
  the deployed API). Bearer token lives in `localStorage` (`wild_life_token`).
  Read **@web/docs/ui-architecture.md** before adding a page or detail view — it's
  the object/representation model (objects, their representations, and how framing
  is chosen).

## Develop

```bash
# backend — http://localhost:9005
cd api
uv sync
uv run wild-life                 # run the service
uv run pytest tests/ -v             # tests (needs the Wild PC Postgres)
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
`wildpc` builds in place from this working tree (each `source:` is a path into
`/data/repos/wild-life`), so publishing needs no commit or push.

- **Iterate.** `pnpm dev` (web, :5173) hot-reloads. `uv run wild-life` (API,
  :9005) has no autoreload — restart it after backend edits. `pnpm dev` talks to
  whatever `VITE_API_BASE_URL` names; `web/.env.development.local` defaults it to the
  deployed API.
- **Publish web** → `wildpc program build wild-life` (or `pnpm build`). Caddy serves
  `web/dist/` in place, so rebuilding `dist/` *is* the deploy. `wildpc apply` does
  **not** build — only run it when the route or manifest changes.
- **Publish API** → the package is installed editable, so the service imports source
  directly: a code-only change just needs `wildpc service restart wild-life-api`. Run
  `wildpc apply wild-life-api` when deps or env changed (it does `uv sync` + reconcile
  + restart).
- **Schema change** → run `alembic upgrade head` against the Wild PC db yourself
  first; nothing runs migrations for you.

## Architecture worth knowing

- **Object-first UI (OOUX).** The frontend is built around domain *objects* and
  their *representations*, not pages/flows. One object → a default representation
  set (reference chip · list row · picker · a modeless detail-editor `EditableRecord`),
  framed as pane / modal / full-page by context (routing). Read
  **@web/docs/ui-architecture.md** before adding a page or deciding how an object
  should appear — it has the selection rule and the property test for when an object
  earns bespoke views (e.g. Person, Event, Project).
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

## Deploy & operate (Wild PC)

This box runs [Wild PC](https://github.com/payneio/castle) (`/data/repos/castle`,
CLI: `wildpc`). It builds, runs, routes, and supervises every app on the machine
from source. You don't hand-write systemd units, Caddy routes, or env files —
you edit **manifests** and run `wildpc apply`, which renders and reconciles the
running system. Full model + docs: `/data/repos/castle/AGENTS.md`.

### The two layers (where this app is declared)

Wild PC splits each app into *what it is* (program) and *how it runs here*
(deployment). Both live under `~/.wildpc/`, keyed by program name:

| File | Role | This app |
| ---- | ---- | -------- |
| `~/.wildpc/programs/wild-life-api.yaml` | catalog: `source`, `stack`, build | `source: /data/repos/wild-life/api`, `stack: python-fastapi` |
| `~/.wildpc/programs/wild-life.yaml` | catalog for the web app | `source: /data/repos/wild-life/web`, `stack: react-vite`, build `pnpm build → dist/` |
| `~/.wildpc/deployments/services/wild-life-api.yaml` | run as a **systemd service** | `manager: systemd`, port 9005, health `/health`, `requires: postgres`, env below |
| `~/.wildpc/deployments/statics/wild-life.yaml` | serve built SPA via **caddy** | `manager: caddy`, `root: dist`, `requires: wild-life-api` |

The service manifest's `defaults.env` is where the backend's config comes from
(not files in this repo). It uses Wild PC templating — `${port}`, `${data_dir}`,
and `${secret:NAME}` (resolved from the OpenBao secret backend):

```yaml
WILD_LIFE_PORT: ${port}
WILD_LIFE_DATA_DIR: ${data_dir}
WILD_LIFE_DATABASE_URL: postgresql+asyncpg://castle:${secret:POSTGRES_PASSWORD}@localhost:5432/castle
WILD_LIFE_TOKEN: ${secret:WILD_LIFE_TOKEN}
WILD_LIFE_CORS_ORIGINS: https://wild-life.civil.payne.io
```

Rendered artifacts (do not edit by hand — regenerated on apply): the systemd unit
`wildpc-wild-life-api.service` (a **user** service: `systemctl --user …`), its env
file `~/.wildpc/secrets/env/wildpc-wild-life-api.service.env`, and the gateway
routes in `~/.wildpc/artifacts/specs/Caddyfile`. Live URLs go through the caddy
gateway (`civil.payne.io`, exposed via a cloudflared tunnel):
`https://wild-life-api.civil.payne.io` and `https://wild-life.civil.payne.io`.

### Everyday commands

```bash
wildpc apply --plan             # dry-run: show what would change (do this first)
wildpc apply wild-life-api       # build + (re)start the API service from api/
wildpc apply wild-life           # publish/refresh the caddy route (does NOT build dist)
wildpc apply                    # converge everything

wildpc status                   # health of all deployments
wildpc list --kind service      # what's registered
wildpc service logs wild-life-api        # tail API logs  (also: journalctl --user -u wildpc-wild-life-api.service)
wildpc service restart wild-life-api     # imperative bounce (no rebuild)
wildpc program info wild-life-api        # resolved manifest + paths
wildpc program build|test|lint|check wild-life-api   # run the stack's commands
wildpc doctor                   # diagnose setup/runtime; wildpc graph shows relationships
```

Secrets live in the OpenBao backend, never in the repo:

```bash
wildpc secret list
wildpc secret get WILD_LIFE_TOKEN      # e.g. to auth a curl against :9005
wildpc secret set WILD_LIFE_TOKEN      # prompts for value
```

### Making common changes

- **Code change** → see [From a code change to live](#from-a-code-change-to-live):
  web is `wildpc program build wild-life`, API is `wildpc service restart wild-life-api`.
  Builds run from this working tree (not a git ref), so no commit is needed.
- **Backend env / new setting** → edit `deployments/services/wild-life-api.yaml`
  `defaults.env`, then `wildpc apply wild-life-api`.
- **New secret** → `wildpc secret set NAME`, reference it as `${secret:NAME}` in
  the manifest env, `wildpc apply`.
- **Change a port / route / CORS** → edit the deployment manifest (`expose.http`,
  `reach`) and/or the CORS env line, `wildpc apply`.
- **Gotcha:** the `wild-life` static build runs `pnpm build` but *not*
  `pnpm install`. After a clean checkout, run `pnpm install` in `web/` once
  before the first `wildpc apply wild-life`, or `dist/` won't be produced.

## Conventions

- Match the surrounding code's style, naming, and comment density in each subdir.
- A global git `commit-msg` hook rejects any commit message mentioning "claude".
- Backend datetime columns are all tz-aware (`DateTime(timezone=True)`); statuses
  are `Literal`-validated Text — see @api/CLAUDE.md.
