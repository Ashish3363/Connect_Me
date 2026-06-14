# Message Expiration

**Status:** Implemented (backend)
**Last updated:** 2026-06-14

Chat messages live for **24 hours** from creation, then disappear. Rooms, users,
memberships and all metadata are untouched — only message rows expire. This keeps
the database bounded over time while the rest of the system persists indefinitely.

---

## 1. Architecture overview

Three pieces work together; **Postgres is the source of truth** for all of them:

| Piece | File | Role |
|-------|------|------|
| Retention math + purges | `app/services/cleanup.py` | Pure cutoff rules + the `DELETE`s |
| Background scheduler | `app/core/scheduler.py` | Runs the purge hourly, in-process |
| Retrieval filter | `app/api/rooms.py`, `app/services/rooms.py` | Hides expired rows at read time |
| Indexes | migration `0007_message_expiration` | Makes the sweep + filter cheap |

The creation timestamp is the **existing `sent_at`** column on `room_messages`
(and `private_messages`) — no new column was added. It is `timezone=True` with a
`server_default now()`, so every message has an accurate creation time.

---

## 2. Expiration workflow

```
message created  ──sent_at = now()──►  visible
                                         │
        now - sent_at  ≤ 24h  ───────────┤  returned by GET /rooms/{id}/messages
                                         │  delivered live over WebSocket
        now - sent_at  >  24h  ──────────┤  filtered out at read time (invisible)
                                         │  deleted by the next cleanup run
                                         ▼
                                       gone
```

Two independent guarantees make a message vanish at 24h:

1. **Read-time filter (immediate).** `GET /rooms/{id}/messages` computes
   `cutoff = now - MESSAGE_RETENTION_HOURS` and queries `sent_at >= cutoff`. An
   expired message is **never returned even if the cleanup job hasn't deleted it
   yet** — there is no window where stale messages leak.
2. **Cleanup job (bounded storage).** The hourly sweep physically deletes
   `sent_at < cutoff`, so the tables don't grow without bound.

The edge is inclusive and consistent across both: a message exactly 24h old is
still alive (`is_expired` is `<`, the filter is `>=`). This is asserted by
`test_retrieval_cutoff_matches_expiry_predicate`.

### Pagination

`GET /rooms/{id}/messages?limit=N` applies the time filter **before** the
`ORDER BY sent_at DESC LIMIT N`, so pagination returns the N most recent *live*
messages and stays correct as expired rows drop out.

### WebSocket

Realtime behavior is unchanged:

- New messages are created and broadcast exactly as before — they appear
  instantly for connected users.
- The socket does **not** replay history on connect; clients load history via the
  REST endpoint, which already filters expired messages, so a newly connected
  user never receives an expired message.
- Deleting old rows is a pure DB operation that doesn't touch live sockets, so
  existing clients are unaffected (they keep whatever they already rendered; no
  frame is sent on deletion, nothing to crash on).

---

## 3. Cleanup scheduling

`app/core/scheduler.py` defines `CleanupScheduler`, started in the FastAPI
lifespan (`app/main.py`) and stopped on shutdown.

- Runs **one pass on startup**, then every `MESSAGE_CLEANUP_INTERVAL_MINUTES`.
- Because it lives in-process, it **restarts automatically with the app** — no
  separate worker to babysit, and no in-memory state to lose (each run recomputes
  the cutoff from the clock and reads/writes Postgres).
- Waits on an `asyncio.Event`, so shutdown is prompt rather than blocking up to a
  full interval.
- Each run logs the outcome, e.g.
  `cleanup: deleted 142 expired message(s) (140 room, 2 private)` or
  `cleanup: nothing to delete`.

### Multi-instance safety

If more than one app instance runs, each cycle first takes a Postgres **session
advisory lock** (`pg_try_advisory_lock`). Only the instance that gets it performs
the delete that cycle; the others skip (the work is idempotent, but the lock
avoids redundant scans). The lock is connection-scoped and released at cycle end.

### Optional room cleanup

Off by default. When `ENABLE_ROOM_CLEANUP=true`, the same job also deletes rooms
whose last activity — `COALESCE(last_message_at, created_at)` — predates
`ROOM_RETENTION_DAYS`. Deleting a room cascades to its messages via the FK.

While disabled (the default), **rooms persist forever**: empty rooms keep
existing, and a user can always rejoin the same room after its messages expire.

---

## 4. Database changes

Migration **`0007_message_expiration`** adds single-column indexes on `sent_at`:

| Index | Table | Why |
|-------|-------|-----|
| `ix_room_messages_sent_at` | `room_messages` | range scan for the global `DELETE … WHERE sent_at < cutoff` and the read filter |
| `ix_private_messages_sent_at` | `private_messages` | same, for DMs |

The pre-existing composite indexes (`(room_id, sent_at)`) are room-keyed and
can't serve a global range scan on `sent_at` alone — hence the dedicated ones.

No columns were added or renamed; `sent_at` already existed and serves as the
creation timestamp.

Apply with:

```bash
cd backend
uv run alembic upgrade head
```

---

## 5. Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `MESSAGE_RETENTION_HOURS` | `24` | How long a message stays visible/stored |
| `MESSAGE_CLEANUP_INTERVAL_MINUTES` | `60` | How often the cleanup job runs |
| `ROOM_RETENTION_DAYS` | `30` | Inactivity before a room is eligible for cleanup |
| `ENABLE_ROOM_CLEANUP` | `false` | Master switch for optional room cleanup |

These are read from the environment via `app/core/config.py` (Pydantic
`Settings`). Unlike the rate limit / freshness knobs (which live in `app_settings`
for live admin tuning), retention is process configuration and is read from env —
matching the task's specification. Changing a value takes effect on restart.

---

## 6. Deployment notes (Render)

- **No in-memory source of truth.** Messages live in Postgres; expiration is a
  `DELETE` and a `WHERE sent_at >= cutoff` filter. Restarting the service loses
  nothing — the scheduler simply starts a fresh loop and the next run catches any
  backlog that accrued while it was down.
- **Survives restarts.** The scheduler is part of the app lifespan, so every
  deploy/restart brings it back automatically.
- **Multiple instances are safe** thanks to the advisory lock (above); the delete
  itself is idempotent regardless.
- **No extra infra required** — no cron service, no Celery/Redis dependency for
  cleanup (Redis remains optional, used only for pub/sub fan-out and rate
  limiting).

---

## 7. Tests

`backend/tests/test_cleanup.py` covers the retention rules as pure functions
(no DB, exact `now`):

- message expiration logic and the 24h boundary (inclusive edge),
- read-filter ↔ expiry-predicate consistency (no leak, no over-deletion),
- room inactivity eligibility, including empty rooms measured from `created_at`,
- `CleanupResult` accounting.

```bash
cd backend
uv run pytest -q
```
