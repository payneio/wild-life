# personal

Monorepo for the personal life-management app — a single-user
CRM / Calendar / Journal / Planner.

## Layout

| Path   | What                     | Stack             | Castle program  |
| ------ | ------------------------ | ----------------- | --------------- |
| `api/` | Backend HTTP API         | FastAPI + SQLAlchemy (async), Postgres | `personal-api`  |
| `web/` | Frontend SPA             | React + Vite + TanStack Query | `personal`      |

Both were previously separate repos (`personal` and `personal-api`); their
histories are preserved here under `web/` and `api/` respectively.

## Develop

```bash
# backend (port 9005)
cd api && uv sync && uv run personal-api

# frontend (port 5173, proxies to the API via VITE_API_BASE_URL)
cd web && pnpm install && pnpm dev
```

See `api/CLAUDE.md` for backend architecture, models, and migrations.

## Deploy

Deployed by [castle](https://github.com/payneio/castle) as two programs that
point at the subdirectories:

- `personal-api` → `api/` (systemd service, `https://personal-api.civil.payne.io`)
- `personal` → `web/` (static build served by the gateway, `https://personal.civil.payne.io`)

```bash
castle apply personal-api   # rebuild + restart the API service
castle apply personal       # rebuild + publish the web bundle
```
