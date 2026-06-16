# Production deployment (Neon + Render + Vercel)

**Status:** Implemented (code-side) — infra setup is manual
**Last updated:** 2026-06-16

How to take the app live on a free-tier stack, and the code changes made to
support it. The split is deliberate:

| Layer | Service | Why |
|-------|---------|-----|
| React frontend (`Chat_app/`) | **Vercel** | static/SPA hosting, automatic HTTPS, CDN |
| FastAPI + WebSockets (`backend/`) | **Render** | long-lived WS support, gives `wss://` |
| PostgreSQL + PostGIS | **Neon** | serverless Postgres, generous free tier |

HTTPS (required for browser geolocation) is automatic on both Vercel and Render.

## Code changes made for production-readiness

Before this work the frontend only worked through the Vite dev proxy, which does
**not** exist in a production build. Three changes fix that:

### 1. Env-driven API base URL

- `Chat_app/src/api.js` — `const BASE = import.meta.env.VITE_API_URL || '/api'`
- `Chat_app/src/services/chat.js` — `const API = import.meta.env.VITE_API_URL || '/api'`

In dev (env unset) it falls back to `/api` and the Vite proxy. In production it
points straight at the Render backend.

### 2. Env-driven WebSocket base URL

`Chat_app/src/services/chat.js` (`connectRoom`):

```js
const wsBase =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
const url = `${wsBase}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`
```

`wss://` is selected automatically over HTTPS (checklist item: WS must be `wss://`
in production, not `ws://`).

### 3. SPA rewrite for client-side routing

`Chat_app/vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

The app uses `BrowserRouter` with dynamic routes (`/rooms/:roomId`). Without this
rewrite, a refresh, bookmark, or shared link to any route except `/` would hit
Vercel's static host directly and 404 — the React app would never boot. The
rewrite serves `index.html` for every path so React Router can read the URL and
render the right page. Safe here because API/WS traffic goes to a *different*
domain (Render), so the catch-all can't swallow `/api` or `/ws`.

### 4. CORS for production + preview origins

- `backend/app/core/config.py` — `cors_origins` (localhost dev) and
  `cors_origin_regex` (`https://connect-me-wine(-[a-z0-9-]+)?\.vercel\.app`).
- `backend/app/main.py` — `CORSMiddleware` reads both from settings.

The regex allows the production Vercel URL **and** per-branch preview URLs, while
blocking unrelated `*.vercel.app` apps. `allow_credentials=True` means a wildcard
(`*`) origin is not permitted — origins must be explicit, which is why the regex
is scoped. Both are env-overridable: `CORS_ORIGINS` (JSON list) and
`CORS_ORIGIN_REGEX` (string).

## Step-by-step deploy

### A. Neon (database) — do this first

1. Create a Neon project → get the connection string.
2. **Enable PostGIS** (the app uses GeoAlchemy2 + `ST_DWithin`; migrations fail
   without it):
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Convert the URL to the async driver the app expects:
   `postgresql+asyncpg://<user>:<pass>@<host>/<db>` (note `+asyncpg`).
   Keep Neon's `?sslmode=require` / channel-binding params as provided.

### B. Render (backend)

- **Root Directory:** `backend`
- **Build:** install deps (`uv sync` or `pip install .`)
- **Start / pre-deploy:** run migrations before serving —
  `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment variables:**
  | Var | Value |
  |-----|-------|
  | `DATABASE_URL` | the Neon async URL from step A |
  | `JWT_SECRET` | a fresh 64-char secret (`python -c "import secrets; print(secrets.token_urlsafe(64))"`) |
  | `APP_ENV` | `production` |
  | `REDIS_URL` | **leave unset** — single instance uses in-process fan-out |
  | (optional) `CORS_ORIGINS` / `CORS_ORIGIN_REGEX` | only if overriding the defaults; `CORS_ORIGINS` must be a JSON list |

### C. Vercel (frontend)

- **Root Directory:** `Chat_app`
- **Framework Preset:** Vite (Build `npm run build`, Output `dist`)
- **Environment variables:**
  | Var | Value |
  |-----|-------|
  | `VITE_API_URL` | `https://<your-backend>.onrender.com` (no trailing slash, no `/api`) |
  | `VITE_WS_URL` | `wss://<your-backend>.onrender.com` |

  Backend routes are mounted at root (`/auth/...`, `/rooms/...`, `/ws/rooms/...`),
  so `VITE_API_URL` must be the bare backend origin — the path is appended by the
  client.

## Free-tier caveats to expect

- **Render free instances sleep after ~15 min idle.** First request after sleep
  is a ~50 s cold start, and **all WebSocket connections drop when it sleeps** —
  the frontend needs reconnect handling for a smooth experience. Acceptable for
  a demo/V1.
- **Neon autosuspends** when idle; the first query wakes it (~1 s).
- **Redis is not needed for V1.** It only matters at 2+ backend instances (see
  redis-pubsub-fanout.md). On a single Render instance, leave `REDIS_URL` unset.
- **Vercel preview deployments** are covered by the CORS regex, but only the
  production domain is the stable shareable URL.

## Pre-flight checklist

- [ ] Neon: PostGIS extension enabled
- [ ] Neon URL uses `postgresql+asyncpg://`
- [ ] Render: `alembic upgrade head` runs on deploy
- [ ] Render: `JWT_SECRET`, `DATABASE_URL`, `APP_ENV=production` set; `REDIS_URL` unset
- [ ] Vercel: Root Directory = `Chat_app`, framework = Vite
- [ ] Vercel: `VITE_API_URL` / `VITE_WS_URL` point at Render (no trailing slash)
- [ ] CORS regex matches the live Vercel domain
- [ ] `backend/.env` is gitignored and not committed (it is)

## Changelog

- **2026-06-16** — Initial deployment setup. Made frontend API/WS URLs
  env-driven (`VITE_API_URL`, `VITE_WS_URL`) with dev-proxy fallback; added
  `Chat_app/vercel.json` SPA rewrite; scoped backend CORS to production +
  Vercel preview origins via `cors_origin_regex`. Documented the Neon → Render →
  Vercel deploy procedure and free-tier caveats.
