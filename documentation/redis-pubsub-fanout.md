# Redis pub/sub fan-out for WebSockets

_Added 2026-06-14._

## Why

WebSocket connections are pinned to a single backend process. The socket
registry in `app/realtime.py` (`RoomManager._rooms`) is in-memory, so with more
than one server instance a message created on instance B never reaches a client
connected to instance A — they only see their own instance's traffic.

Redis sits between instances as a message bus so live fan-out works cluster-wide.

## How it works

```
Bob → instance B → save message to Postgres
                 → PUBLISH payload to redis channel "room:{id}"
                        │
        ┌───────────────┴───────────────┐
   instance A (SUBSCRIBE room:*)   instance B (SUBSCRIBE room:*)
   → send to A's local sockets     → send to B's local sockets
   → Alice sees it                 → Bob sees it
```

Key rule: `broadcast()` no longer writes to sockets directly when Redis is
active — it **publishes**. Each instance runs one background task subscribed to
`room:*`; on every received payload it fans out to *its own* local sockets. The
originating instance delivers via this same round-trip, so there is exactly one
delivery path and no duplicates.

## What changed

- `app/realtime.py` — `RoomManager` gained `startup()`, `shutdown()`,
  `_deliver_local()`, and `_listen()`. The socket registry
  (`connect`/`disconnect`/`count`) is unchanged — it is always per-process.
- `app/main.py` — a FastAPI `lifespan` handler calls `manager.startup()` /
  `manager.shutdown()`.
- `app/core/config.py` — new optional `redis_url` setting (env `REDIS_URL`).
- `pyproject.toml` — added `redis>=5.0`.

The message call sites (`manager.broadcast(...)` in `app/api/rooms.py`) did
**not** change.

## Configuration

Provider-agnostic via one env var:

```
REDIS_URL=redis://localhost:6379/0        # self-hosted / Docker
REDIS_URL=rediss://:password@host:6379/0  # managed/TLS (Upstash, ElastiCache…)
```

- **Unset** → single-server mode, in-process fan-out (the original behavior).
- **Set and reachable** → cluster mode, cross-instance delivery active.
- **Set but unreachable at startup** → logs a warning and degrades to
  local-only fan-out so a single instance keeps serving (cross-instance
  delivery is disabled until Redis is back and the app restarts). A publish
  that fails at runtime also falls back to local delivery for that message.

## Deploy notes

- Point every instance at the **same** Redis. Pub/sub messages are fire-and-
  forget and not persisted — Redis here is a bus, not storage (history still
  lives in Postgres).
- A single shared Redis handles a very high publish rate; it is not the
  bottleneck before the app tier is.

## Shared Redis client

Both the pub/sub fan-out and the message rate limiter (below) use **one**
shared client created in `app/core/redis.py` and started in the lifespan. It's
None when Redis is unset/unreachable, and every consumer degrades from there.
`client.pubsub()` takes its own connection from the pool, so the subscription
and normal commands (PUBLISH, EVAL) share the one client safely.

## Related: distributed message rate limiter

_Added 2026-06-14._

The per-user send limiter (`app/core/ratelimit.py`) is now Redis-backed so the
limit is enforced **globally** across instances, not per-process.

- Algorithm: a per-user sorted set `ratelimit:msg:{user_id}` whose scores are
  hit timestamps (ms). A Lua script trims the window, counts, and conditionally
  adds — atomically, server-side — so concurrent sends from different instances
  can't race past the limit. `now` is read from Redis `TIME` inside the script,
  giving one clock for all instances.
- Entry point `message_limiter.check()` is now **async**. It prefers Redis and
  falls back to the original in-process `SlidingWindowLimiter` when Redis is
  unset or a call fails — so a send check never hard-fails on infra.
- The admin-tunable limit (`message_rate_limit_per_minute` in `app_settings`)
  is unchanged; the route still reads it and passes it in.

Verified: existing in-process limiter tests plus a fallback-dispatch test pass.
The live Redis/Lua path needs a running Redis to exercise (none was available
in the dev env at implementation time; it degrades cleanly without one).
