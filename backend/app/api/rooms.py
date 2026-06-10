"""Locality room routes: start (create-or-join), nearby discovery, messages,
and the realtime room WebSocket."""
from __future__ import annotations

import uuid
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
from app.core.security import InvalidTokenError, decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.realtime import manager
from app.schemas.room import RoomMessageOut, RoomOut, SendMessageIn, StartRoomIn
from app.services import auth as auth_service
from app.services import rooms as rooms_service

router = APIRouter(prefix="/rooms", tags=["rooms"])
ws_router = APIRouter(tags=["rooms"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]


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
    rows = await rooms_service.list_messages(session, room_id=room_id, limit=limit)
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
    msg = await rooms_service.create_message(
        session, room_id=room_id, sender_id=user.id, content=body.content
    )
    await session.commit()
    out = _message_out(
        msg, rooms_service.sender_display(user.display_name, user.username, user.email)
    )
    await manager.broadcast(str(room_id), out.model_dump(mode="json"))
    return out


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


@ws_router.websocket("/ws/rooms/{room_id}")
async def room_ws(
    websocket: WebSocket, room_id: uuid.UUID, token: str | None = Query(default=None)
) -> None:
    user = await _authenticate_ws(token)
    if user is None:
        await websocket.close(code=4401)
        return

    async with AsyncSessionLocal() as session:
        room = await rooms_service.get_room(session, room_id)
    if room is None:
        await websocket.close(code=4404)
        return

    sender_name = rooms_service.sender_display(
        user.display_name, user.username, user.email
    )
    room_key = str(room_id)
    await manager.connect(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            content = (data.get("content") or "").strip()[:2000]
            if not content:
                continue
            async with AsyncSessionLocal() as session:
                msg = await rooms_service.create_message(
                    session, room_id=room_id, sender_id=user.id, content=content
                )
                await session.commit()
                out = _message_out(msg, sender_name)
            await manager.broadcast(room_key, out.model_dump(mode="json"))
    except WebSocketDisconnect:
        manager.disconnect(room_key, websocket)
    except Exception:
        manager.disconnect(room_key, websocket)
        try:
            await websocket.close()
        except Exception:
            pass
