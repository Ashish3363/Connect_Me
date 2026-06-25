"""Nearby private messaging: persistent connections + ephemeral messages.

A *connection* is one canonical row per unordered pair (``user_a_id <
user_b_id``); it is location-agnostic and reused forever. A live *session* is
scoped to a room — the proximity gate measures both participants against that
room's centre, reusing the same ``ST_DWithin`` / freshness rules as rooms. The
gate logic lives here so it is shared by the REST and WebSocket send paths.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from geoalchemy2 import Geography
from sqlalchemy import and_, case, cast, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nearby_connection import NearbyConnection
from app.models.private_message import PrivateMessage
from app.models.user import User
from app.services.location import is_location_fresh


def canonical_pair(
    a: uuid.UUID, b: uuid.UUID
) -> tuple[uuid.UUID, uuid.UUID]:
    """Order a user pair so the smaller UUID is always ``user_a`` — the form the
    unique constraint and check constraint expect."""
    return (a, b) if a < b else (b, a)


def is_participant(conn: NearbyConnection, user_id: uuid.UUID) -> bool:
    return user_id in (conn.user_a_id, conn.user_b_id)


def other_user_id(conn: NearbyConnection, user_id: uuid.UUID) -> uuid.UUID:
    return conn.user_b_id if conn.user_a_id == user_id else conn.user_a_id


def _geo_point(lat: float, lng: float):
    # geography(POINT,4326) from lng/lat, fully parameterised — mirrors rooms.
    return cast(
        func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326),
        Geography(geometry_type="POINT", srid=4326),
    )


async def get_or_create_connection(
    session: AsyncSession, *, me_id: uuid.UUID, other_id: uuid.UUID
) -> NearbyConnection:
    """Return the pair's connection, creating it on first contact.

    Idempotent and race-safe: an ``INSERT ... ON CONFLICT DO NOTHING`` on the
    canonical pair means two users opening the chat simultaneously converge on
    one row instead of colliding on the unique constraint.
    """
    a, b = canonical_pair(me_id, other_id)
    await session.execute(
        pg_insert(NearbyConnection)
        .values(user_a_id=a, user_b_id=b)
        .on_conflict_do_nothing(constraint="uq_nearby_connections_pair")
    )
    return await session.scalar(
        select(NearbyConnection).where(
            NearbyConnection.user_a_id == a, NearbyConnection.user_b_id == b
        )
    )


async def get_connection(
    session: AsyncSession, connection_id: uuid.UUID
) -> NearbyConnection | None:
    return await session.get(NearbyConnection, connection_id)


async def list_connections(session: AsyncSession, user_id: uuid.UUID):
    """All of the user's persistent connections, most-recently-active first.

    Returns rows of ``(NearbyConnection, other_user)`` — the other participant is
    whichever side of the canonical pair isn't the caller. This is the data
    behind the "Personal Chats" list; it is room-agnostic (every past contact,
    regardless of where they last met).
    """
    other_id = case(
        (NearbyConnection.user_a_id == user_id, NearbyConnection.user_b_id),
        else_=NearbyConnection.user_a_id,
    )
    stmt = (
        select(NearbyConnection, User)
        .join(User, User.id == other_id)
        .where(
            or_(
                NearbyConnection.user_a_id == user_id,
                NearbyConnection.user_b_id == user_id,
            )
        )
        .order_by(NearbyConnection.last_interaction_at.desc())
    )
    return (await session.execute(stmt)).all()


async def touch_connection(
    session: AsyncSession, connection_id: uuid.UUID
) -> None:
    """Mark activity (resets the inactivity-reap clock). Called on message send
    and on an in-range (re)connect. Does not commit."""
    await session.execute(
        update(NearbyConnection)
        .where(NearbyConnection.id == connection_id)
        .values(last_interaction_at=func.now())
    )


async def create_dm_message(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    sender_id: uuid.UUID,
    content: str,
) -> PrivateMessage:
    msg = PrivateMessage(
        connection_id=connection_id, sender_id=sender_id, content=content
    )
    session.add(msg)
    await session.flush()
    await touch_connection(session, connection_id)
    await session.refresh(msg)
    return msg


async def unread_counts(
    session: AsyncSession,
    *,
    viewer_id: uuid.UUID,
    connection_ids: list[uuid.UUID],
    since: datetime | None = None,
) -> dict[uuid.UUID, int]:
    """Per-connection count of messages the viewer hasn't read yet — messages the
    *other* person sent (``sender_id != viewer``) with ``read_at IS NULL``. One
    grouped query for the whole list. ``since`` (the retention cutoff) keeps
    soon-to-expire messages from inflating the badge."""
    if not connection_ids:
        return {}
    stmt = (
        select(PrivateMessage.connection_id, func.count())
        .where(
            PrivateMessage.connection_id.in_(connection_ids),
            PrivateMessage.sender_id != viewer_id,
            PrivateMessage.read_at.is_(None),
        )
        .group_by(PrivateMessage.connection_id)
    )
    if since is not None:
        stmt = stmt.where(PrivateMessage.sent_at >= since)
    rows = (await session.execute(stmt)).all()
    return {cid: int(n) for (cid, n) in rows}


async def mark_read(
    session: AsyncSession, *, connection_id: uuid.UUID, viewer_id: uuid.UUID
) -> None:
    """Mark every message the viewer received in this connection as read (now).
    Idempotent — already-read rows are skipped by the ``read_at IS NULL`` filter.
    Does not commit."""
    await session.execute(
        update(PrivateMessage)
        .where(
            PrivateMessage.connection_id == connection_id,
            PrivateMessage.sender_id != viewer_id,
            PrivateMessage.read_at.is_(None),
        )
        .values(read_at=func.now())
    )


async def list_dm_messages(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    limit: int = 50,
    since: datetime | None = None,
):
    """Most recent messages, oldest-first. Rows: (PrivateMessage, name, username,
    email). ``since`` (the retention cutoff) excludes expired rows even before the
    cleanup job deletes them — identical to the room message query."""
    stmt = (
        select(
            PrivateMessage, User.display_name, User.username, User.email
        )
        .join(User, User.id == PrivateMessage.sender_id)
        .where(PrivateMessage.connection_id == connection_id)
        .order_by(PrivateMessage.sent_at.desc(), PrivateMessage.id.desc())
        .limit(limit)
    )
    if since is not None:
        stmt = stmt.where(PrivateMessage.sent_at >= since)
    rows = (await session.execute(stmt)).all()
    rows.reverse()
    return rows


async def presence_map(
    session: AsyncSession,
    *,
    user_ids: list[uuid.UUID],
    center_lat: float,
    center_lng: float,
    radius_m: float,
    freshness_seconds: int,
    now: datetime,
) -> dict[uuid.UUID, bool]:
    """For a batch of users, which are currently reachable from a room — fresh
    fix AND inside the room's geofence. One query for the whole list (no N+1),
    used to render in-range dots in the Personal Chats list."""
    if not user_ids:
        return {}
    center = _geo_point(center_lat, center_lng)
    fresh_cutoff = now - timedelta(seconds=freshness_seconds)
    in_range = and_(
        User.location_updated_at.isnot(None),
        User.location_updated_at >= fresh_cutoff,
        func.ST_DWithin(User.current_location, center, radius_m),
    )
    rows = (
        await session.execute(
            select(User.id, in_range.label("in_range")).where(User.id.in_(user_ids))
        )
    ).all()
    return {uid: bool(flag) for (uid, flag) in rows}


async def user_within_geofence(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    center_lat: float,
    center_lng: float,
    radius_m: float,
) -> bool:
    """True if the user's last stored fix is within ``radius_m`` of the room
    centre. Freshness is checked separately so the caller can distinguish a stale
    fix (refresh + retry) from being genuinely out of range."""
    center = _geo_point(center_lat, center_lng)
    inside = await session.scalar(
        select(func.ST_DWithin(User.current_location, center, radius_m)).where(
            User.id == user_id
        )
    )
    return bool(inside)


async def is_user_present(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    center_lat: float,
    center_lng: float,
    radius_m: float,
    freshness_seconds: int,
    now: datetime,
) -> bool:
    """The recipient-presence gate: the user's last fix is both fresh AND inside
    the room geofence. One read of the ``users`` row (freshness + ``ST_DWithin``).
    Fails closed — a missing location, stale fix, or out-of-range position all
    return False, so messaging never proceeds toward someone who isn't here."""
    center = _geo_point(center_lat, center_lng)
    row = (
        await session.execute(
            select(
                User.location_updated_at,
                func.ST_DWithin(User.current_location, center, radius_m).label(
                    "inside"
                ),
            ).where(User.id == user_id)
        )
    ).first()
    if row is None or not row.inside:
        return False
    return is_location_fresh(row.location_updated_at, now, freshness_seconds)
