# Wild Life

Monorepo for the Wild Life life-management app — a single-user
CRM / Calendar / Journal / Planner.

## Layout

| Path   | What                     | Stack             | Castle program  |
| ------ | ------------------------ | ----------------- | --------------- |
| `api/` | Backend HTTP API         | FastAPI + SQLAlchemy (async), Postgres | `wild-life-api`  |
| `web/` | Frontend SPA             | React + Vite + TanStack Query | `wild-life`      |

Both were previously separate repos (a web app and its API); their
histories are preserved here under `web/` and `api/` respectively.

## Develop

```bash
# backend (port 9005)
cd api && uv sync && uv run wild-life

# frontend (port 5173, proxies to the API via VITE_API_BASE_URL)
cd web && pnpm install && pnpm dev
```

See `api/CLAUDE.md` for backend architecture, models, and migrations.

## Deploy

Deployed by [castle](https://github.com/payneio/castle) as two programs that
point at the subdirectories:

- `wild-life-api` → `api/` (systemd service, `https://wild-life-api.civil.payne.io`)
- `wild-life` → `web/` (static build served by the gateway, `https://wild-life.civil.payne.io`)

```bash
castle apply wild-life-api   # rebuild + restart the API service
castle apply wild-life       # rebuild + publish the web bundle
```
