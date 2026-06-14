"""Locality room routes: start (create-or-join), nearby discovery, messages,
and the realtime room WebSocket."""
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
from app.schemas.room import (
    LocationStatusOut,
    LocationUpdateIn,
    RoomMessageOut,
    RoomOut,
    SendMessageIn,
    StartRoomIn,
)
from app.services import auth as auth_service
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

router = APIRouter(prefix="/rooms", tags=["rooms"])
ws_router = APIRouter(tags=["rooms"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]

DEFAULT_MESSAGE_RATE_LIMIT = 20

# WebSocket close code used when a connected user is ejected for leaving the
# room's geofenced area (after the grace window).
WS_GEOFENCE_EXIT_CODE = 4403


async def _freshness_seconds(session: AsyncSession) -> int:
    return await settings_repo.get_int(
        session, "location_freshness_seconds", DEFAULT_FRESHNESS_SECONDS
    )


async def _require_fresh_location(session: AsyncSession, user: User) -> None:
    """REST gate: raise 428 if the caller's last fix is older than the window.

    The client should refresh via ``POST /rooms/{id}/location`` (or any path
    that carries coordinates) and then retry the action.
    """
    freshness = await _freshness_seconds(session)
    if not is_location_fresh(user.location_updated_at, datetime.now(timezone.utc), freshness):
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail={
                "code": "stale_location",
                "message": "Refresh your location before this action.",
                "freshness_seconds": freshness,
            },
        )


async def _check_send_rate(session: AsyncSession, user_id: uuid.UUID) -> int:
    """Record a send attempt for the user. Returns 0 if allowed, else the
    Retry-After seconds. Limit is read from app_settings (admin-tunable)."""
    limit = await settings_repo.get_int(
        session, "message_rate_limit_per_minute", DEFAULT_MESSAGE_RATE_LIMIT
    )
    allowed, retry_after = await message_limiter.check(str(user_id), limit)
    return 0 if allowed else retry_after


def _room_out(room, distance_m: float, members: int) -> RoomOut:
    return RoomOut(
        id=room.id,
        name=room.name or "Local area",
        geohash=room.geohash,
        distance_m=round(float(distance_m), 1),
        members=int(members),
        last_message_at=room.last_message_at,
    )


def _message_out(msg, sender_name: str) -> RoomMessageOut:
    return RoomMessageOut(
        id=msg.id,
        room_id=msg.room_id,
        sender_id=msg.sender_id,
        sender_name=sender_name,
        content=msg.content,
        sent_at=msg.sent_at,
    )


@router.post("/start", response_model=RoomOut)
async def start_room(body: StartRoomIn, user: UserDep, session: SessionDep) -> RoomOut:
    room = await rooms_service.create_or_join_room(session, lat=body.lat, lng=body.lng)
    await rooms_service.update_user_location(
        session, user_id=user.id, lat=body.lat, lng=body.lng, geohash=room.geohash
    )

    first_message = None
    if body.message and body.message.strip():
        retry_after = await _check_send_rate(session, user.id)
        if retry_after:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="message rate limit exceeded",
                headers={"Retry-After": str(retry_after)},
            )
        msg = await rooms_service.create_message(
            session, room_id=room.id, sender_id=user.id, content=body.message.strip()
        )
        first_message = _message_out(
            msg,
            rooms_service.sender_display(user.display_name, user.username, user.email),
        )

    await session.commit()
    await session.refresh(room)
    members = await rooms_service.room_member_count(session, room.id)

    # The caller is at the room's cell, so distance is ~0.
    if first_message is not None:
        await manager.broadcast(str(room.id), first_message.model_dump(mode="json"))
    return _room_out(room, 0.0, members)


@router.get("/nearby", response_model=list[RoomOut])
async def nearby(
    user: UserDep,
    session: SessionDep,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> list[RoomOut]:
    rows, _radius = await rooms_service.nearby_rooms(session, lat=lat, lng=lng)
    return [_room_out(room, dist, members) for room, dist, members in rows]


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(room_id: uuid.UUID, user: UserDep, session: SessionDep) -> RoomOut:
    room = await rooms_service.get_room(session, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="room not found")
    members = await rooms_service.room_member_count(session, room_id)
    return _room_out(room, 0.0, members)


@router.get("/{room_id}/messages", response_model=list[RoomMessageOut])
async def get_messages(
    room_id: uuid.UUID,
    user: UserDep,
    session: SessionDep,
    limit: int = Query(50, ge=1, le=200),
) -> list[RoomMessageOut]:
    # Never return messages past their retention window, even if the cleanup
    # job hasn't deleted them yet.
    cutoff = expiry_cutoff(
        datetime.now(timezone.utc), get_settings().message_retention_hours
    )
    rows = await rooms_service.list_messages(
        session, room_id=room_id, limit=limit, since=cutoff
    )
    return [
        _message_out(msg, rooms_service.sender_display(dn, un, em))
        for (msg, dn, un, em) in rows
    ]


@router.post("/{room_id}/messages", response_model=RoomMessageOut)
async def post_message(
    room_id: uuid.UUID, body: SendMessageIn, user: UserDep, session: SessionDep
) -> RoomMessageOut:
    room = await rooms_service.get_room(session, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="room not found")
    await _require_fresh_location(session, user)
    retry_after = await _check_send_rate(session, user.id)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="message rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )
    msg = await rooms_service.create_message(
        session, room_id=room_id, sender_id=user.id, content=body.content
    )
    await session.commit()
    out = _message_out(
        msg, rooms_service.sender_display(user.display_name, user.username, user.email)
    )
    await manager.broadcast(str(room_id), out.model_dump(mode="json"))
    return out


@router.post("/{room_id}/location", response_model=LocationStatusOut)
async def refresh_location(
    room_id: uuid.UUID, body: LocationUpdateIn, user: UserDep, session: SessionDep
) -> LocationStatusOut:
    """Refresh the caller's stored location and report geofence standing.

    The REST counterpart of the WebSocket ``location`` frame: clients call this
    to clear a `stale_location` (428) gate. It reports whether the new fix is
    inside the room radius, but — unlike the live socket — there is no
    connection to eject here, so REST geofence breaches are informational only.
    """
    room = await rooms_service.get_room(session, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="room not found")

    precision = await rooms_service.geohash_precision(session)
    geohash = encode_geohash(body.lat, body.lng, precision)
    await rooms_service.update_user_location(
        session, user_id=user.id, lat=body.lat, lng=body.lng, geohash=geohash
    )
    await session.commit()

    radius_m = await rooms_service.geofence_radius_m(session)
    center_lat, center_lng = geohash_center(room.geohash)
    inside, distance = within_geofence(
        body.lat, body.lng, center_lat, center_lng, radius_m
    )
    return LocationStatusOut(
        fresh=True,
        within_geofence=inside,
        distance_m=round(distance, 1),
        radius_m=radius_m,
        location_updated_at=datetime.now(timezone.utc),
    )


# --------------------------------------------------------------------------
# WebSocket: /ws/rooms/{room_id}?token=<jwt>
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
    """Pull a valid (lat, lng) out of a WS frame, or None if malformed."""
    try:
        lat = float(data["lat"])
        lng = float(data["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return None
    return lat, lng


@ws_router.websocket("/ws/rooms/{room_id}")
async def room_ws(
    websocket: WebSocket, room_id: uuid.UUID, token: str | None = Query(default=None)
) -> None:
    """Realtime room socket.

    Frames are discriminated on ``type``:

    * ``{"type": "location", "lat": .., "lng": ..}`` — refresh the user's fix.
      Updates the stored location, then runs the geofence check: inside →
      ``location_ack``; outside → ``geofence_warning`` (with grace remaining);
      outside past the grace window → ``geofence_exit`` and the socket closes.
    * ``{"type": "message", "content": ..}`` (or a legacy ``{"content": ..}``
      with no type) — post a message. Blocked with a ``stale_location`` error
      frame if the user's last fix is older than the freshness window.

    Freshness is checked against an in-process mirror of the user's last fix, so
    the per-message gate costs no DB read; only an actual ``location`` frame
    writes to the DB (≈ once per slow-cadence interval per connected user).
    """
    user = await _authenticate_ws(token)
    if user is None:
        await websocket.close(code=4401)
        return

    async with AsyncSessionLocal() as session:
        room = await rooms_service.get_room(session, room_id)
        if room is None:
            await websocket.close(code=4404)
            return
        freshness_seconds = await _freshness_seconds(session)
        grace_seconds = await settings_repo.get_int(
            session, "geofence_grace_seconds", DEFAULT_GEOFENCE_GRACE_SECONDS
        )
        radius_m = await rooms_service.geofence_radius_m(session)
        precision = await rooms_service.geohash_precision(session)

    sender_name = rooms_service.sender_display(
        user.display_name, user.username, user.email
    )
    room_key = str(room_id)
    center_lat, center_lng = geohash_center(room.geohash)

    # In-process mirror of the user's freshness, seeded from the row loaded at
    # auth and refreshed on every location frame — keeps the per-message gate
    # off the DB. The geofence tracker holds the hysteresis state for this socket.
    location_updated_at = user.location_updated_at
    geofence = GeofenceTracker(grace_seconds=grace_seconds)

    await manager.connect(room_key, websocket)
    close_code = 1000  # set to WS_GEOFENCE_EXIT_CODE when ejected for geofence

    # If the last known fix is already stale, ask for one up front. Messages stay
    # blocked by the per-message gate until a fresh location frame arrives.
    if not is_location_fresh(location_updated_at, datetime.now(timezone.utc), freshness_seconds):
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
                    await websocket.send_json(
                        {
                            "type": "location_ack",
                            "within_geofence": True,
                            "distance_m": round(distance, 1),
                        }
                    )
                elif action == WARN:
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
                else:  # REMOVE — outside continuously past the grace window
                    await websocket.send_json(
                        {
                            "type": "geofence_exit",
                            "detail": "You have left this room's area.",
                            "distance_m": round(distance, 1),
                            "radius_m": radius_m,
                        }
                    )
                    close_code = WS_GEOFENCE_EXIT_CODE
                    break
                continue

            # Chat message: typed frame, or a legacy {content} frame with no type.
            if frame_type not in (None, "message"):
                continue
            content = (data.get("content") or "").strip()[:2000]
            if not content:
                continue
            if not is_location_fresh(
                location_updated_at, datetime.now(timezone.utc), freshness_seconds
            ):
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "stale_location",
                        "detail": "Send a fresh location before posting.",
                        "freshness_seconds": freshness_seconds,
                    }
                )
                continue

            async with AsyncSessionLocal() as session:
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
                msg = await rooms_service.create_message(
                    session, room_id=room_id, sender_id=user.id, content=content
                )
                await session.commit()
                out = _message_out(msg, sender_name)
            await manager.broadcast(room_key, out.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("room_ws: unexpected error; closing socket")
    finally:
        manager.disconnect(room_key, websocket)
        try:
            await websocket.close(code=close_code)
        except Exception:
            pass
