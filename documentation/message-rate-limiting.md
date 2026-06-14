# Message Rate Limiting

**Status:** Implemented (backend)
**Last updated:** 2026-06-14

Caps how many messages a single user can send to **20 per rolling 60 seconds**
across every message entry point. The limit is admin-tunable via `app_settings`.

---

## 1. Why and where

Without a cap, one user (or a script holding a valid JWT) can flood a room over
either the REST endpoint or the WebSocket. The limit is enforced at **all three**
send paths so none can be used to bypass the others:

| Entry point | File | On limit exceeded |
|-------------|------|-------------------|
| `POST /rooms/{id}/messages` | `app/api/rooms.py` | `429` + `Retry-After` header |
| `POST /rooms/start` (optional first message) | `app/api/rooms.py` | `429` + `Retry-After` header |
| WebSocket `/ws/rooms/{id}` | `app/api/rooms.py` | JSON error frame, socket stays open |

The WebSocket path does **not** drop the connection; it sends:

```json
{ "type": "error", "code": "rate_limited",
  "detail": "message rate limit exceeded", "retry_after": 12 }
```

so the client can back off and keep the room open.

---

## 2. How it works

`app/core/ratelimit.py` holds a `SlidingWindowLimiter` (`message_limiter`):

- Per-user `deque` of recent send timestamps (`time.monotonic()`).
- On each attempt it evicts timestamps older than the 60s window, then allows
  the send only if fewer than `limit` remain, recording the new timestamp.
- A **rejected** attempt is *not* recorded, so hammering while blocked does not
  push the window further out.
- `retry_after` is the whole seconds until the oldest in-window hit ages out.

The check-and-record runs with no `await` in between, so it is atomic on the
single asyncio event loop — no lock required.

### Single-process caveat

Like `app.realtime.RoomManager`, this state lives **in process memory**. It
resets on restart and is **not shared across workers**. For a multi-instance
deploy, back the limiter with Redis (a per-user sorted set of timestamps, or
`INCR` + `EXPIRE` on a 1-second bucket); the call sites do not change.

---

## 3. Tuning the limit

The number is **not hardcoded** — it is read from `app_settings`
(consistent with the project's runtime-tunable-defaults rule):

| Setting key | Default | Meaning |
|-------------|---------|---------|
| `message_rate_limit_per_minute` | `20` | Max messages per user per 60s window |

- Seeded by Alembic migration `0005_message_rate_limit`.
- Reads go through `settings_repo.get_int(...)`, which has a 30s TTL cache, so
  the per-send overhead is negligible. After an admin update, call
  `settings_repo.invalidate("message_rate_limit_per_minute")` (or wait out the
  TTL) for the change to take effect.
- If the row is missing, the app falls back to `20` (the migration is for admin
  visibility, not correctness).

---

## 4. Applying the migration

```bash
cd backend
uv run alembic upgrade head
```

The window length (60s) is a constant in `ratelimit.py` (`WINDOW_SECONDS`); only
the per-minute count is runtime-tunable.
