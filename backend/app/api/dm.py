"""Nearby private messaging: REST (start / history / send) under a room, plus a
realtime WebSocket per connection.

The connection is persistent and room-agnostic, but every send is gated by the
*active room's* geofence — both the sender and the recipient must be inside it
with a fresh fix. The gate and fan-out reuse the room infrastructure verbatim
(``GeofenceTracker``, ``within_geofence``, ``is_location_fresh``, the per-user
rate limiter, and ``RoomManager`` keyed ``dm:<connection_id>``)."""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_session
from app.core import settings_repo
from app.core.config import get_settings
from app.core.geo import encode_geohash, geohash_center
from app.core.ratelimit import message_limiter
from app.core.security import InvalidTokenError, decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.realtime import manager
from app.schemas.dm import DmConnectionOut, DmMessageOut, SendDmIn, StartDmIn
from app.services import auth as auth_service
from app.services import dm as dm_service
from app.services import rooms as rooms_service
from app.services.cleanup import expiry_cutoff
from app.services.location import (
    DEFAULT_FRESHNESS_SECONDS,
    DEFAULT_GEOFENCE_GRACE_SECONDS,
    GEOFENCE_RECHECK_INTERVAL_SECONDS,
    INSIDE,
    REMOVE,
    WARN,
    GeofenceTracker,
    is_location_fresh,
    within_geofence,
)

logger = logging.getLogger(__name__)

# REST lives under the room for session context; the connection id identifies the
# (room-agnostic) thread.
router = APIRouter(prefix="/rooms/{room_id}/dm", tags=["dm"])
# Room-agnostic routes (listing the caller's connections — the "Personal Chats").
list_router = APIRouter(prefix="/dm", tags=["dm"])
ws_router = APIRouter(tags=["dm"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]

DEFAULT_MESSAGE_RATE_LIMIT = 20

# WebSocket close codes.
WS_AUTH_FAILED_CODE = 4401
WS_NOT_FOUND_CODE = 4404
WS_NOT_PARTICIPANT_CODE = 4403


def _channel(connection_id: uuid.UUID) -> str:
    return f"dm:{connection_id}"


def _display(user: User) -> str:
    return rooms_service.sender_display(
        user.display_name, user.username, user.email
    )


def _message_out(msg, sender_name: str) -> DmMessageOut:
    return DmMessageOut(
        id=msg.id,
        connection_id=msg.connection_id,
        sender_id=msg.sender_id,
        sender_name=sender_name,
        content=msg.content,
        sent_at=msg.sent_at,
    )


async def _freshness_seconds(session: AsyncSession) -> int:
    return await settings_repo.get_int(
        session, "location_freshness_seconds", DEFAULT_FRESHNESS_SECONDS
    )


async def _check_send_rate(session: AsyncSession, user_id: uuid.UUID) -> int:
    """0 if allowed, else Retry-After seconds. Shares the per-user limiter with
    room messages (one budget per user across both surfaces)."""
    limit = await settings_repo.get_int(
        session, "message_rate_limit_per_minute", DEFAULT_MESSAGE_RATE_LIMIT
    )
    allowed, retry_after = await message_limiter.check(str(user_id), limit)
    return 0 if allowed else retry_after


async def _load_participant_connection(
    session: AsyncSession, connection_id: uuid.UUID, user_id: uuid.UUID
):
    conn = await dm_service.get_connection(session, connection_id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="connection not found"
        )
    if not dm_service.is_participant(conn, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="not a participant"
        )
    return conn


# --------------------------------------------------------------------------
# REST
# --------------------------------------------------------------------------
@list_router.get("/connections", response_model=list[DmConnectionOut])
async def list_connections(
    user: UserDep,
    session: SessionDep,
    room_id: uuid.UUID | None = Query(default=None),
) -> list[DmConnectionOut]:
    """The caller's persistent connections ("Personal Chats"), most-recently-
    active first. Room-agnostic — every past contact, openable from any room.

    When ``room_id`` is supplied (the room the caller is currently in), each
    contact's ``in_range`` reports whether they're reachable right now — a fresh
    fix inside that room's geofence — to drive the green dot in the list.
    """
    rows = await dm_service.list_connections(session, user.id)

    cutoff = expiry_cutoff(
        datetime.now(timezone.utc), get_settings().message_retention_hours
    )
    unread = await dm_service.unread_counts(
        session,
        viewer_id=user.id,
        connection_ids=[conn.id for (conn, _) in rows],
        since=cutoff,
    )

    presence: dict[uuid.UUID, bool] = {}
    if room_id is not None and rows:
        room = await rooms_service.get_room(session, room_id)
        if room is not None:
            radius_m = await rooms_service.geofence_radius_m(session)
            freshness = await _freshness_seconds(session)
            center_lat, center_lng = geohash_center(room.geohash)
            presence = await dm_service.presence_map(
                session,
                user_ids=[other.id for (_, other) in rows],
                center_lat=center_lat,
                center_lng=center_lng,
                radius_m=radius_m,
                freshness_seconds=freshness,
                now=datetime.now(timezone.utc),
            )

    return [
        DmConnectionOut(
            id=conn.id,
            other_user_id=other.id,
            other_user_name=_display(other),
            other_has_avatar=other.has_avatar,
            last_interaction_at=conn.last_interaction_at,
            in_range=presence.get(other.id, False),
            unread_count=unread.get(conn.id, 0),
        )
        for (conn, other) in rows
    ]


@list_router.post("/{connection_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_dm_read(
    connection_id: uuid.UUID, user: UserDep, session: SessionDep
) -> None:
    """Mark all messages the caller received in this connection as read — clears
    the unread badge. Room-agnostic (reading isn't gated by location)."""
    await _load_participant_connection(session, connection_id, user.id)
    await dm_service.mark_read(session, connection_id=connection_id, viewer_id=user.id)
    await session.commit()


@router.post("/start", response_model=DmConnectionOut)
async def start_dm(
    room_id: uuid.UUID, body: StartDmIn, user: UserDep, session: SessionDep
) -> DmConnectionOut:
    """Open (or reopen) the connection with another user met in this room.

    Idempotent — the same pair always resolves to the same connection, in any
    room. Not gated on location: opening and reading history is always allowed;
    only *sending* requires being in range.
    """
    if body.other_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot start a chat with yourself",
        )
    room = await rooms_service.get_room(session, room_id)
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="room not found"
        )
    other = await auth_service.get_user_by_id(session, body.other_user_id)
    if other is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="user not found"
        )

    conn = await dm_service.get_or_create_connection(
        session, me_id=user.id, other_id=other.id
    )
    # Opening the chat in a room is itself an "encounter" — keep the relationship
    # alive even if no message is sent this time.
    await dm_service.touch_connection(session, conn.id)
    await session.commit()
    await session.refresh(conn)

    return DmConnectionOut(
        id=conn.id,
        other_user_id=other.id,
        other_user_name=_display(other),
        other_has_avatar=other.has_avatar,
        last_interaction_at=conn.last_interaction_at,
    )


@router.get("/{connection_id}/messages", response_model=list[DmMessageOut])
async def get_dm_messages(
    room_id: uuid.UUID,
    connection_id: uuid.UUID,
    user: UserDep,
    session: SessionDep,
    limit: int = Query(50, ge=1, le=200),
) -> list[DmMessageOut]:
    await _load_participant_connection(session, connection_id, user.id)
    cutoff = expiry_cutoff(
        datetime.now(timezone.utc), get_settings().message_retention_hours
    )
    rows = await dm_service.list_dm_messages(
        session, connection_id=connection_id, limit=limit, since=cutoff
    )
    return [
        _message_out(msg, rooms_service.sender_display(dn, un, em))
        for (msg, dn, un, em) in rows
    ]


@router.post("/{connection_id}/messages", response_model=DmMessageOut)
async def post_dm_message(
    room_id: uuid.UUID,
    connection_id: uuid.UUID,
    body: SendDmIn,
    user: UserDep,
    session: SessionDep,
) -> DmMessageOut:
    """REST fallback for the WebSocket send path. Runs the full two-sided gate."""
    conn = await _load_participant_connection(session, connection_id, user.id)
    room = await rooms_service.get_room(session, room_id)
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="room not found"
        )

    freshness = await _freshness_seconds(session)
    now = datetime.now(timezone.utc)
    radius_m = await rooms_service.geofence_radius_m(session)
    center_lat, center_lng = geohash_center(room.geohash)

    # Sender gate: fresh, then inside the room geofence.
    if not is_location_fresh(user.location_updated_at, now, freshness):
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail={
                "code": "stale_location",
                "message": "Refresh your location before this action.",
                "freshness_seconds": freshness,
            },
        )
    if not await dm_service.user_within_geofence(
        session,
        user_id=user.id,
        center_lat=center_lat,
        center_lng=center_lng,
        radius_m=radius_m,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "out_of_range", "message": "You're outside this room's area."},
        )

    # Recipient gate: the other person must also be present in this room's area.
    other_id = dm_service.other_user_id(conn, user.id)
    if not await dm_service.is_user_present(
        session,
        user_id=other_id,
        center_lat=center_lat,
        center_lng=center_lng,
        radius_m=radius_m,
        freshness_seconds=freshness,
        now=now,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "recipient_unavailable",
                "message": "The other person has left the area.",
            },
        )

    retry_after = await _check_send_rate(session, user.id)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="message rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    msg = await dm_service.create_dm_message(
        session, connection_id=connection_id, sender_id=user.id, content=body.content
    )
    await session.commit()
    out = _message_out(msg, _display(user))
    await manager.broadcast(_channel(connection_id), out.model_dump(mode="json"))
    return out


# --------------------------------------------------------------------------
# WebSocket: /ws/dm/{connection_id}?room_id=<room_id>&token=<jwt>
# --------------------------------------------------------------------------
async def _authenticate_ws(token: str | None) -> User | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except InvalidTokenError:
        return None
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None
    async with AsyncSessionLocal() as session:
        return await auth_service.get_user_by_id(session, user_id)


def _coerce_latlng(data: dict) -> tuple[float, float] | None:
    try:
        lat = float(data["lat"])
        lng = float(data["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return None
    return lat, lng


@ws_router.websocket("/ws/dm/{connection_id}")
async def dm_ws(
    websocket: WebSocket,
    connection_id: uuid.UUID,
    token: str | None = Query(default=None),
    room_id: uuid.UUID | None = Query(default=None),
) -> None:
    """Realtime DM socket for one connection, scoped to a room's geofence.

    Self frames mirror the room socket (``location_required`` / ``location_ack``
    / ``geofence_warning`` / ``geofence_exit`` / ``error``). Additionally, an
    inside↔outside transition is **broadcast** as a ``peer_presence`` frame so the
    other participant's composer flips immediately. Unlike the room socket, a
    geofence exit does NOT close this socket — the DM merely pauses and
    auto-resumes when the user returns; the parent room socket owns eviction.
    """
    user = await _authenticate_ws(token)
    if user is None:
        await websocket.close(code=WS_AUTH_FAILED_CODE)
        return
    if room_id is None:
        await websocket.close(code=WS_NOT_FOUND_CODE)
        return

    async with AsyncSessionLocal() as session:
        conn = await dm_service.get_connection(session, connection_id)
        if conn is None:
            await websocket.close(code=WS_NOT_FOUND_CODE)
            return
        if not dm_service.is_participant(conn, user.id):
            await websocket.close(code=WS_NOT_PARTICIPANT_CODE)
            return
        room = await rooms_service.get_room(session, room_id)
        if room is None:
            await websocket.close(code=WS_NOT_FOUND_CODE)
            return

        freshness_seconds = await _freshness_seconds(session)
        grace_seconds = await settings_repo.get_int(
            session, "geofence_grace_seconds", DEFAULT_GEOFENCE_GRACE_SECONDS
        )
        radius_m = await rooms_service.geofence_radius_m(session)
        precision = await rooms_service.geohash_precision(session)
        other_id = dm_service.other_user_id(conn, user.id)
        center_lat, center_lng = geohash_center(room.geohash)
        now = datetime.now(timezone.utc)

        # Snapshot both sides' presence so the freshly-opened panel renders the
        # right composer state immediately.
        peer_present = await dm_service.is_user_present(
            session,
            user_id=other_id,
            center_lat=center_lat,
            center_lng=center_lng,
            radius_m=radius_m,
            freshness_seconds=freshness_seconds,
            now=now,
        )
        self_inside = await dm_service.is_user_present(
            session,
            user_id=user.id,
            center_lat=center_lat,
            center_lng=center_lng,
            radius_m=radius_m,
            freshness_seconds=freshness_seconds,
            now=now,
        )
        # Reconnecting in range is an "encounter" — keep the relationship alive.
        await dm_service.touch_connection(session, conn.id)
        await session.commit()

    sender_name = _display(user)
    channel = _channel(connection_id)
    location_updated_at = user.location_updated_at
    geofence = GeofenceTracker(grace_seconds=grace_seconds)

    await manager.connect(channel, websocket)

    async def broadcast_self_presence(present: bool) -> None:
        await manager.broadcast(
            channel,
            {
                "type": "peer_presence",
                "user_id": str(user.id),
                "name": sender_name,
                "present": present,
            },
        )

    # Tell the just-connected client whether the peer is currently around.
    await websocket.send_json(
        {"type": "peer_presence", "user_id": str(other_id), "present": peer_present}
    )
    if self_inside:
        # Let the peer know we just (re)appeared...
        await broadcast_self_presence(True)
        # ...and tell THIS client its own in-range state up front, so the composer
        # enables immediately instead of flashing "out of range" until the first
        # GPS frame round-trips.
        await websocket.send_json(
            {"type": "location_ack", "within_geofence": True, "distance_m": 0.0}
        )
    elif not is_location_fresh(
        location_updated_at, datetime.now(timezone.utc), freshness_seconds
    ):
        await websocket.send_json(
            {"type": "location_required", "freshness_seconds": freshness_seconds}
        )

    try:
        while True:
            data = await websocket.receive_json()
            frame_type = data.get("type")

            if frame_type == "location":
                coords = _coerce_latlng(data)
                if coords is None:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "bad_location",
                            "detail": "lat/lng required and must be valid",
                        }
                    )
                    continue
                lat, lng = coords
                geohash = encode_geohash(lat, lng, precision)
                async with AsyncSessionLocal() as session:
                    await rooms_service.update_user_location(
                        session, user_id=user.id, lat=lat, lng=lng, geohash=geohash
                    )
                    await session.commit()
                location_updated_at = datetime.now(timezone.utc)

                inside, distance = within_geofence(
                    lat, lng, center_lat, center_lng, radius_m
                )
                action = geofence.observe(inside, time.monotonic())
                if action == INSIDE:
                    if not self_inside:
                        self_inside = True
                        await broadcast_self_presence(True)
                        async with AsyncSessionLocal() as session:
                            await dm_service.touch_connection(session, connection_id)
                            await session.commit()
                    await websocket.send_json(
                        {
                            "type": "location_ack",
                            "within_geofence": True,
                            "distance_m": round(distance, 1),
                        }
                    )
                elif action == WARN:
                    if self_inside:
                        self_inside = False
                        await broadcast_self_presence(False)
                    await websocket.send_json(
                        {
                            "type": "geofence_warning",
                            "within_geofence": False,
                            "distance_m": round(distance, 1),
                            "radius_m": radius_m,
                            "grace_seconds_remaining": geofence.seconds_remaining(
                                time.monotonic()
                            ),
                            "recheck_interval_seconds": GEOFENCE_RECHECK_INTERVAL_SECONDS,
                        }
                    )
                else:  # REMOVE — outside past the grace window
                    if self_inside:
                        self_inside = False
                        await broadcast_self_presence(False)
                    # Pause, don't close: the room socket handles eviction and the
                    # DM resumes automatically when the user returns in range.
                    await websocket.send_json(
                        {
                            "type": "geofence_exit",
                            "detail": "You have left this room's area.",
                            "distance_m": round(distance, 1),
                            "radius_m": radius_m,
                        }
                    )
                continue

            # Chat message: typed frame, or a legacy {content} frame with no type.
            if frame_type not in (None, "message"):
                continue
            content = (data.get("content") or "").strip()[:2000]
            if not content:
                continue

            now = datetime.now(timezone.utc)
            if not is_location_fresh(location_updated_at, now, freshness_seconds):
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "stale_location",
                        "detail": "Send a fresh location before posting.",
                        "freshness_seconds": freshness_seconds,
                    }
                )
                continue
            if not self_inside:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "out_of_range",
                        "detail": "You're outside this room's area.",
                    }
                )
                continue

            async with AsyncSessionLocal() as session:
                now = datetime.now(timezone.utc)
                if not await dm_service.is_user_present(
                    session,
                    user_id=other_id,
                    center_lat=center_lat,
                    center_lng=center_lng,
                    radius_m=radius_m,
                    freshness_seconds=freshness_seconds,
                    now=now,
                ):
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "recipient_unavailable",
                            "detail": "The other person has left the area.",
                        }
                    )
                    continue
                retry_after = await _check_send_rate(session, user.id)
                if retry_after:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "rate_limited",
                            "detail": "message rate limit exceeded",
                            "retry_after": retry_after,
                        }
                    )
                    continue
                msg = await dm_service.create_dm_message(
                    session,
                    connection_id=connection_id,
                    sender_id=user.id,
                    content=content,
                )
                await session.commit()
                out = _message_out(msg, sender_name)
            await manager.broadcast(channel, out.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("dm_ws: unexpected error; closing socket")
    finally:
        manager.disconnect(channel, websocket)
        # Closing the panel is NOT the same as leaving the area. Report our
        # ACTUAL current presence (from location) so the peer's banner stays
        # correct: still in range -> they keep messaging us (delivered as unread);
        # genuinely out of range -> they see we left. (Geofence transitions while
        # the socket was open already broadcast the "left" case in real time.)
        try:
            async with AsyncSessionLocal() as session:
                still_present = await dm_service.is_user_present(
                    session,
                    user_id=user.id,
                    center_lat=center_lat,
                    center_lng=center_lng,
                    radius_m=radius_m,
                    freshness_seconds=freshness_seconds,
                    now=datetime.now(timezone.utc),
                )
            await broadcast_self_presence(still_present)
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
