"""Per-user sliding-window rate limiter for message sends.

Two backends behind one async entry point (`message_limiter.check`):

* Redis (multi-instance): a per-user sorted set of hit timestamps, trimmed and
  counted atomically by a Lua script, so the window is shared across workers.
* In-process (`SlidingWindowLimiter`): the single-server fallback, also used
  whenever Redis is unset or unreachable.

The limit itself is not stored here — callers read it from `app_settings`
(`message_rate_limit_per_minute`) and pass it in, so it stays admin-tunable.
"""
from __future__ import annotations

import logging
import math
import time
import uuid
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60


class SlidingWindowLimiter:
    """Tracks recent hit timestamps per key over a rolling time window.

    The check-and-record is synchronous (no awaits between read and append),
    so it is atomic on the single asyncio event loop — no lock needed.
    """

    def __init__(self, window_seconds: int = WINDOW_SECONDS) -> None:
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int) -> tuple[bool, int]:
        """Record an attempt against `key`. Returns (allowed, retry_after_s).

        retry_after_s is 0 when allowed; otherwise the whole seconds until the
        oldest in-window hit ages out and a slot frees up. A rejected attempt
        is NOT recorded, so spamming while blocked doesn't extend the window.
        """
        now = time.monotonic()
        cutoff = now - self._window
        hits = self._hits[key]
        while hits and hits[0] <= cutoff:
            hits.popleft()

        if len(hits) >= limit:
            retry_after = self._window - (now - hits[0])
            # Don't leave an empty deque lingering for an idle blocked key.
            if not hits:
                self._hits.pop(key, None)
            return False, max(int(retry_after) + 1, 1)

        hits.append(now)
        return True, 0

    def reset(self, key: str | None = None) -> None:
        """Clear state for one key, or all keys. Mainly for tests."""
        if key is None:
            self._hits.clear()
        else:
            self._hits.pop(key, None)


# Atomic sliding window over a per-user sorted set (scores are hit timestamps
# in ms). Computing `now` from Redis TIME keeps one clock across all instances
# and makes the whole check race-free. Returns {allowed (1/0), retry_after_ms}.
_REDIS_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, window - (now - tonumber(oldest[2]))}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, 0}
"""

_KEY_PREFIX = "ratelimit:msg:"


class MessageRateLimiter:
    """Async limiter that prefers Redis and falls back to in-process.

    The fallback covers both single-server deploys (Redis never configured) and
    transient Redis failures, so a send check never hard-fails on infra.
    """

    def __init__(self, window_seconds: int = WINDOW_SECONDS) -> None:
        self._window = window_seconds
        self._local = SlidingWindowLimiter(window_seconds)
        self._script = None  # registered redis Script when Redis is active

    def use_redis(self, client) -> None:
        """Wire up the shared Redis client (or None for in-process mode)."""
        self._script = client.register_script(_REDIS_SLIDING_WINDOW_LUA) if client else None

    async def check(self, key: str, limit: int) -> tuple[bool, int]:
        """Record an attempt. Returns (allowed, retry_after_seconds)."""
        if self._script is not None:
            try:
                allowed, retry_ms = await self._script(
                    keys=[_KEY_PREFIX + key],
                    args=[self._window * 1000, limit, uuid.uuid4().hex],
                )
                if allowed:
                    return True, 0
                return False, max(math.ceil(retry_ms / 1000), 1)
            except Exception:
                logger.warning(
                    "ratelimit: Redis check failed — using in-process limiter",
                    exc_info=True,
                )
        return self._local.check(key, limit)


# Shared limiter for room/DM message sends across all entry points.
message_limiter = MessageRateLimiter()
