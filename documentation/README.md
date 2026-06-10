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
