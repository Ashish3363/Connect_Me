# Hyperlocal Chat

A location-gated chat web app. You can only talk to people who are physically **near you** — by default within **1 km**. Walk away and you can still read history, but you can no longer send. Conversations are tied to where you are, not who you already know.

## What it does

- **Public neighborhood rooms** — every location maps to a geohash cell with its own public room, created on the fly when the first person nearby starts chatting. Open the app, share your location, and you drop into the room for your patch of the map.
- **Nearby private messages (1-to-1 DMs)** — tap someone in a room to start a direct chat. The DM only stays "live" while both people remain fresh and in range of the room it was opened from; step out of range and sending pauses.
- **Distance gating** — the "can I send?" check uses a real geofence radius (PostGIS `ST_DWithin`), and locations older than a few minutes are treated as out-of-range to discourage spoofing.
- **Ephemeral by design** — messages expire after a retention window and idle connections are reaped, so the app stays about *here and now*.
- **Admin controls** — user management (ban/suspend/delete), a globally tunable geofence radius, and analytics. No message moderation.

## Use cases

- Chat with people in the same café, campus, event, market, or neighborhood without exchanging contacts.
- Ask "is this place busy / open / worth it?" to whoever is actually there right now.
- Lightweight local Q&A, lost-and-found, or meetups scoped to a small area.
- Spontaneous 1-to-1 conversations with someone nearby that fade once you part ways.

## Tech stack

| Layer    | Stack |
|----------|-------|
| Backend  | FastAPI · SQLAlchemy 2 (async / asyncpg) · WebSockets · JWT auth (bcrypt) |
| Database | PostgreSQL 18 · PostGIS 3.6 · Alembic migrations |
| Geo      | Geohash cells for room discovery · PostGIS `ST_DWithin` for range gating |
| Frontend | React 19 · Vite · Tailwind CSS · React Router |

Repo layout:

- `backend/` — FastAPI app, migrations, and scripts.
- `Chat_app/` — React + Vite frontend.
- `documentation/` — feature-by-feature docs.

## Getting started

### Prerequisites

- Python ≥ 3.11 with [`uv`](https://docs.astral.sh/uv/)
- Node.js (with `npm`)
- PostgreSQL 18 with the PostGIS and pgcrypto extensions enabled on a database named `hyperlocal_chat`

### 1. Backend

```bash
cd backend
# create backend/.env with your DB URL, e.g.:
#   DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/hyperlocal_chat
uv sync                       # install dependencies
uv run alembic upgrade head   # apply migrations
uv run uvicorn app.main:app --port 8000
```

The API is now at `http://localhost:8000` (interactive docs at `/docs`).

To make an existing account an admin:

```bash
uv run python scripts/promote_admin.py <email>
```

### 2. Frontend

```bash
cd Chat_app
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). The dev server proxies `/api/*` (REST) and `/ws/*` (WebSocket) to the backend on port 8000, so start the backend first. Allow location access in the browser when prompted — the app needs it to place you in a room.

## Notes

- Realtime fan-out runs in-process per backend instance; running multiple instances needs the Redis pub/sub path (see `documentation/redis-pubsub-fanout.md`).
- Runtime defaults (geofence radius, geohash precision, location staleness) live in the `app_settings` table and can be tuned without redeploying.
