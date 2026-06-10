"""Locality rooms: create-or-join by geohash, nearby discovery via PostGIS,
and room message persistence."""
from __future__ import annotations

import uuid

from geoalchemy2 import Geography
from sqlalchemy import cast, distinct, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import settings_repo
from app.core.geo import encode_geohash, geohash_center
from app.models.chat_room import ChatRoom
from app.models.room_message import RoomMessage
from app.models.user import User

DEFAULT_RADIUS_M = 1000
DEFAULT_PRECISION = 6


async def _radius_and_precision(session: AsyncSession) -> tuple[int, int]:
    radius = await settings_repo.get_int(
        session, "geofence_radius_meters", DEFAULT_RADIUS_M
    )
    precision = await settings_repo.get_int(
        session, "default_geohash_precision", DEFAULT_PRECISION
    )
    return radius, precision


def _geo_point(lat: float, lng: float):
    # A geography(POINT,4326) value from lng/lat, fully parameterised.
    return cast(
        func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326),
        Geography(geometry_type="POINT", srid=4326),
    )


def _members_subquery():
    # Distinct people who've spoken in the room (correlated per ChatRoom row).
    return (
        select(func.count(distinct(RoomMessage.sender_id)))
        .where(RoomMessage.room_id == ChatRoom.id)
        .correlate(ChatRoom)
        .scalar_subquery()
    )


def sender_display(display_name: str | None, username: str | None, email: str | None) -> str:
    if display_name:
        return display_name
    if username:
        return username
    if email:
        return email.split("@")[0]
    return "Someone"


async def update_user_location(
    session: AsyncSession, *, user_id: uuid.UUID, lat: float, lng: float, geohash: str
) -> None:
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            current_location=_geo_point(lat, lng),
            current_geohash=geohash,
            location_updated_at=func.now(),
        )
    )


async def create_or_join_room(
    session: AsyncSession, *, lat: float, lng: float
) -> ChatRoom:
    """Return the room for the caller's geohash cell, creating it on first use."""
    _, precision = await _radius_and_precision(session)
    geohash = encode_geohash(lat, lng, precision)

    room = await session.scalar(select(ChatRoom).where(ChatRoom.geohash == geohash))
    if room is not None:
        return room

    center_lat, center_lng = geohash_center(geohash)
    room = ChatRoom(
        geohash=geohash,
        precision=precision,
        center_location=_geo_point(center_lat, center_lng),
        name=None,
    )
    session.add(room)
    try:
        await session.flush()
    except IntegrityError:
        # Another request created the same cell between SELECT and INSERT.
        await session.rollback()
        room = await session.scalar(
            select(ChatRoom).where(ChatRoom.geohash == geohash)
        )
    return room


async def nearby_rooms(session: AsyncSession, *, lat: float, lng: float):
    """Rooms whose centre is within the configured radius — the 1km gate.

    Returns (rows, radius_m) where each row is (ChatRoom, distance_m, members).
    """
    radius, _ = await _radius_and_precision(session)
    point = _geo_point(lat, lng)
    distance = func.ST_Distance(ChatRoom.center_location, point)

    stmt = (
        select(ChatRoom, distance.label("distance_m"), _members_subquery().label("members"))
        .where(func.ST_DWithin(ChatRoom.center_location, point, radius))
        .order_by(distance)
    )
    rows = (await session.execute(stmt)).all()
    return rows, radius


async def get_room(session: AsyncSession, room_id: uuid.UUID) -> ChatRoom | None:
    return await session.get(ChatRoom, room_id)


async def room_member_count(session: AsyncSession, room_id: uuid.UUID) -> int:
    n = await session.scalar(
        select(func.count(distinct(RoomMessage.sender_id))).where(
            RoomMessage.room_id == room_id
        )
    )
    return int(n or 0)


async def list_messages(session: AsyncSession, *, room_id: uuid.UUID, limit: int = 50):
    """Most recent messages, returned oldest-first. Rows: (RoomMessage, name, username, email)."""
    stmt = (
        select(RoomMessage, User.display_name, User.username, User.email)
        .join(User, User.id == RoomMessage.sender_id)
        .where(RoomMessage.room_id == room_id)
        .order_by(RoomMessage.sent_at.desc(), RoomMessage.id.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    rows.reverse()
    return rows


async def create_message(
    session: AsyncSession, *, room_id: uuid.UUID, sender_id: uuid.UUID, content: str
) -> RoomMessage:
    msg = RoomMessage(room_id=room_id, sender_id=sender_id, content=content)
    session.add(msg)
    await session.flush()
    await session.execute(
        update(ChatRoom).where(ChatRoom.id == room_id).values(last_message_at=func.now())
    )
    await session.refresh(msg)
    return msg
