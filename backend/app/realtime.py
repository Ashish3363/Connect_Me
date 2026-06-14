"""WebSocket fan-out for room messages, optionally backed by Redis pub/sub.

The socket registry (`_rooms`) is always per-process — a socket lives on the
one worker its client connected to. What changes with scale is *delivery*:

* Single server (no REDIS_URL): `broadcast()` writes straight to the local
  sockets. Same behavior this app shipped with.
* Multiple servers (REDIS_URL set): `broadcast()` PUBLISHes the payload to a
  Redis channel instead. Every instance runs a background task SUBSCRIBEd to
  those channels; when it receives a payload it fans out to *its* local
  sockets. So a message created on instance B reaches Alice's socket on
  instance A. The originating instance also delivers via this round-trip
  (never both directly and via Redis) — one delivery path, no duplicates.

If Redis is configured but unreachable, we log and fall back to local-only
delivery so a single instance keeps working (degraded, not down).

The call sites — connect/disconnect/broadcast — do not change between modes.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Redis pub/sub channel per room. PSUBSCRIBE matches the whole namespace.
_CHANNEL_PREFIX = "room:"
_CHANNEL_PATTERN = f"{_CHANNEL_PREFIX}*"


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._redis = None  # redis.asyncio.Redis when in cluster mode
        self._pubsub = None
        self._listener: asyncio.Task | None = None

    # -- lifecycle -----------------------------------------------------------
    async def startup(self, client) -> None:
        """Start the subscriber against the shared Redis client.

        `client` is None in single-server / Redis-down mode — we stay in
        local-only fan-out and serve traffic normally. The client itself is
        owned by `app.core.redis`; we only manage the subscription here.
        """
        if client is None:
            logger.info("realtime: local-only fan-out")
            return
        try:
            pubsub = client.pubsub(ignore_subscribe_messages=True)
            await pubsub.psubscribe(_CHANNEL_PATTERN)
        except Exception:
            logger.warning(
                "realtime: Redis subscribe failed — falling back to "
                "local-only fan-out (cross-instance delivery DISABLED)",
                exc_info=True,
            )
            return
        self._redis = client
        self._pubsub = pubsub
        self._listener = asyncio.create_task(self._listen())
        logger.info("realtime: Redis pub/sub fan-out active")

    async def shutdown(self) -> None:
        if self._listener:
            self._listener.cancel()
            try:
                await self._listener
            except asyncio.CancelledError:
                pass
            self._listener = None
        if self._pubsub is not None:
            try:
                await self._pubsub.aclose()
            except Exception:
                pass
            self._pubsub = None
        # The shared client is closed by app.core.redis.shutdown(), not here.
        self._redis = None

    # -- registry (always per-process) --------------------------------------
    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[room_id].add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        conns = self._rooms.get(room_id)
        if not conns:
            return
        conns.discard(websocket)
        if not conns:
            self._rooms.pop(room_id, None)

    def count(self, room_id: str) -> int:
        return len(self._rooms.get(room_id, ()))

    # -- delivery ------------------------------------------------------------
    async def broadcast(self, room_id: str, payload: dict) -> None:
        """Deliver a message to every subscriber of a room, cluster-wide.

        With Redis: publish and let the subscriber loop on each instance do the
        local fan-out (including this one). Without Redis, or if the publish
        fails: deliver to this instance's sockets directly.
        """
        if self._redis is not None:
            try:
                await self._redis.publish(
                    _CHANNEL_PREFIX + room_id, json.dumps(payload)
                )
                return
            except Exception:
                logger.warning(
                    "realtime: Redis publish failed — delivering locally only",
                    exc_info=True,
                )
        await self._deliver_local(room_id, payload)

    async def _deliver_local(self, room_id: str, payload: dict) -> None:
        # Copy the set first: sending may drop a dead socket mid-iteration.
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

    async def _listen(self) -> None:
        """Receive published payloads and fan them out to local sockets."""
        assert self._pubsub is not None
        try:
            async for message in self._pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                channel = message["channel"]
                room_id = channel[len(_CHANNEL_PREFIX):]
                try:
                    payload = json.loads(message["data"])
                except (TypeError, ValueError):
                    logger.warning("realtime: dropped non-JSON pub/sub payload")
                    continue
                await self._deliver_local(room_id, payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("realtime: subscriber loop crashed")


manager = RoomManager()
