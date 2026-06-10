"""In-memory WebSocket fan-out for room messages.

One process only. For a multi-instance deploy, put a Redis (or NATS) pub/sub
behind broadcast()/the per-room registry so messages reach sockets on other
workers — the call sites here don't change.
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

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

    async def broadcast(self, room_id: str, payload: dict) -> None:
        # Copy the set first: sending may drop a dead socket mid-iteration.
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)


manager = RoomManager()
