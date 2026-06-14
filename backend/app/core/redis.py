"""Shared Redis client for the whole app.

One connection pool serves both the WebSocket pub/sub fan-out
(`app.realtime`) and the per-user message rate limiter (`app.core.ratelimit`).
`client.pubsub()` takes its own dedicated connection from the pool, so normal
commands (PUBLISH, EVAL) and the subscription coexist on one client.

Optional by design: if `REDIS_URL` is unset or Redis is unreachable at startup,
`startup()` returns None and every caller degrades to in-process behavior. The
app stays up on a single instance; cross-instance features are simply disabled.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_client = None  # redis.asyncio.Redis | None


async def startup(redis_url: str | None):
    """Connect and ping. Returns the client, or None for in-process mode."""
    global _client
    if not redis_url:
        logger.info("redis: no REDIS_URL set — in-process mode")
        return None
    try:
        import redis.asyncio as redis

        client = redis.from_url(redis_url, decode_responses=True)
        await client.ping()
    except Exception:  # connection refused, auth, bad URL, missing dep
        logger.warning(
            "redis: unreachable at startup — degrading to in-process mode "
            "(cross-instance fan-out and shared rate limiting DISABLED)",
            exc_info=True,
        )
        return None
    _client = client
    logger.info("redis: connected")
    return client


async def shutdown() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
        _client = None


def get_client():
    """The shared client, or None if Redis isn't active."""
    return _client
