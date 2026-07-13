# Documentation

Feature-wise documentation for the Hyperlocal Chat app. Each feature has its
own file; each file carries a **Changelog** with dated entries so you can see
what changed and when.

## Convention (how these docs are maintained)

- **One file per feature**, kebab-case name (e.g. `hyperlocal-rooms.md`).
- Every file starts with a header: title, **Status**, and **Last updated** (date).
- Every file ends with a **Changelog** — newest entry first, each dated `YYYY-MM-DD`.
- When a feature **changes**, append a dated changelog entry to its file and bump
  *Last updated*. When a **new feature** ships, add a new file and link it below.
- Dates use `YYYY-MM-DD`.

## Features

| Feature | File | Status | Last updated |
|---------|------|--------|--------------|
| Hyperlocal rooms (geolocation, 1 km gate, realtime) | [hyperlocal-rooms.md](hyperlocal-rooms.md) | Implemented | 2026-06-10 |
| Authentication (login / register UI) | [auth.md](auth.md) | Implemented | 2026-06-10 |
| Liquid-glass design system & app shell | [design-system.md](design-system.md) | Implemented | 2026-06-10 |
| Locality intro experience | [locality-intro.md](locality-intro.md) | Implemented | 2026-06-10 |
| Message rate limiting | [message-rate-limiting.md](message-rate-limiting.md) | Implemented | 2026-06-14 |
| Redis pub/sub WebSocket fan-out | [redis-pubsub-fanout.md](redis-pubsub-fanout.md) | Implemented | 2026-06-14 |
| Location freshness & geofence membership | [location-freshness.md](location-freshness.md) | Implemented | 2026-06-14 |
| Message expiration (24h TTL + cleanup job) | [message-expiration.md](message-expiration.md) | Implemented | 2026-06-14 |
| WhatsApp-style chat message layout | [chat-message-layout.md](chat-message-layout.md) | Implemented | 2026-06-15 |
| User profile & edit (name, photo, password) | [user-profile.md](user-profile.md) | Implemented | 2026-06-15 |
| Production deployment (Neon + Render + Vercel) | [deployment.md](deployment.md) | Implemented (code-side) | 2026-06-16 |
| Nearby private messaging (in-room 1-on-1, two-sided proximity gate) | [private-messages.md](private-messages.md) | Implemented | 2026-06-23 |
| Photo messages (rooms + DMs, 24h TTL, location-gated, sanitized) | [photo-messages-plan-2026-07-12.md](photo-messages-plan-2026-07-12.md) | Implemented | 2026-07-12 |

## Project layout (quick reference)

```
backend/     FastAPI + PostgreSQL/PostGIS + SQLAlchemy (async) + WebSockets
Chat_app/    React (Vite) frontend — liquid-glass UI
documentation/  ← you are here
```

Run locally (two terminals):

```
cd backend  && uv run uvicorn app.main:app --port 8000
cd Chat_app && npm run dev
```
