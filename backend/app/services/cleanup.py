"""Message expiration: retention math + the DB purge operations.

Two layers, kept apart so the rules are unit-testable without a database:

* Pure helpers (``expiry_cutoff``, ``is_expired``, ``room_inactivity_cutoff``,
  ``is_room_inactive``) — the time arithmetic, driven by an explicit ``now``.
* Async purges (``purge_expired_messages``, ``purge_inactive_rooms``) — the
  actual ``DELETE``s, returning how many rows went so the scheduler can log it.

Postgres is the source of truth. Messages expire ``retention_hours`` (default
24) after ``sent_at``; the cleanup job deletes them, and the retrieval API
filters on the same cutoff so an expired message is never returned even in the
window between expiry and the next cleanup run. Rooms, users, memberships and
metadata are never touched by message expiration — only the message rows go.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_room import ChatRoom
from app.models.nearby_connection import NearbyConnection
from app.models.private_message import PrivateMessage
from app.models.room_message import RoomMessage

logger = logging.getLogger(__name__)


# --- pure retention math ---------------------------------------------------
def expiry_cutoff(now: datetime, retention_hours: int) -> datetime:
    """The oldest ``sent_at`` a message may have and still be visible.

    A message is expired when ``sent_at < expiry_cutoff(now, hours)`` — so a
    message exactly ``retention_hours`` old is still considered fresh (the edge
    is inclusive), matching the rate-limiter's window-edge convention.
    """
    return now - timedelta(hours=retention_hours)


def is_expired(sent_at: datetime, now: datetime, retention_hours: int) -> bool:
    """True once a message has lived longer than the retention window."""
    return sent_at < expiry_cutoff(now, retention_hours)


def room_inactivity_cutoff(now: datetime, retention_days: int) -> datetime:
    """Rooms with their last activity before this are eligible for cleanup."""
    return now - timedelta(days=retention_days)


def is_room_inactive(
    last_activity: datetime, now: datetime, retention_days: int
) -> bool:
    """True when a room's most recent activity predates the retention window.

    ``last_activity`` should be the room's ``last_message_at`` when it has ever
    had a message, else its ``created_at`` — so a brand-new empty room is not
    reaped until ``retention_days`` after it was created.
    """
    return last_activity < room_inactivity_cutoff(now, retention_days)


def connection_inactivity_cutoff(now: datetime, retention_days: int) -> datetime:
    """Nearby connections idle since before this are eligible for cleanup."""
    return now - timedelta(days=retention_days)


def is_connection_inactive(
    last_interaction: datetime, now: datetime, retention_days: int
) -> bool:
    """True once a connection has had no interaction for the retention window."""
    return last_interaction < connection_inactivity_cutoff(now, retention_days)


# --- DB purges -------------------------------------------------------------
@dataclass
class CleanupResult:
    room_messages: int = 0
    private_messages: int = 0
    rooms: int = 0
    connections: int = 0

    @property
    def messages(self) -> int:
        return self.room_messages + self.private_messages


async def purge_expired_messages(
    session: AsyncSession, *, now: datetime, retention_hours: int
) -> tuple[int, int]:
    """Delete every message older than the retention window.

    Runs across all rooms/conversations in one ``DELETE`` per table (index range
    scan on ``sent_at``). Returns ``(room_messages_deleted, private_deleted)``.
    Does not commit — the caller owns the transaction.
    """
    cutoff = expiry_cutoff(now, retention_hours)

    room_result = await session.execute(
        delete(RoomMessage).where(RoomMessage.sent_at < cutoff)
    )
    private_result = await session.execute(
        delete(PrivateMessage).where(PrivateMessage.sent_at < cutoff)
    )
    return room_result.rowcount or 0, private_result.rowcount or 0


async def purge_inactive_rooms(
    session: AsyncSession, *, now: datetime, retention_days: int
) -> int:
    """Delete rooms whose last activity predates the retention window.

    Activity is ``COALESCE(last_message_at, created_at)`` so an empty room is
    measured from its creation. Deleting a room cascades to its messages via the
    FK. Returns the number of rooms removed. Opt-in — only called when
    ``ENABLE_ROOM_CLEANUP`` is set. Does not commit.
    """
    cutoff = room_inactivity_cutoff(now, retention_days)
    # created_at is NOT NULL, so COALESCE always yields a real timestamp — a
    # never-used room is measured from when it was created.
    last_activity = func.coalesce(ChatRoom.last_message_at, ChatRoom.created_at)
    result = await session.execute(
        delete(ChatRoom).where(last_activity < cutoff)
    )
    return result.rowcount or 0


async def purge_inactive_connections(
    session: AsyncSession, *, now: datetime, retention_days: int
) -> int:
    """Delete nearby connections idle longer than the retention window.

    The relationship is meant to be temporary: once a pair has gone
    ``retention_days`` with no message exchange and no in-range reconnect (both
    of which bump ``last_interaction_at``), the connection is removed. Deleting a
    connection cascades to any lingering private messages via the FK. Returns the
    number of connections removed. Does not commit.
    """
    cutoff = connection_inactivity_cutoff(now, retention_days)
    result = await session.execute(
        delete(NearbyConnection).where(NearbyConnection.last_interaction_at < cutoff)
    )
    return result.rowcount or 0


async def run_cleanup(
    session: AsyncSession,
    *,
    now: datetime,
    retention_hours: int,
    enable_room_cleanup: bool = False,
    room_retention_days: int = 30,
    connection_retention_days: int = 60,
) -> CleanupResult:
    """One full cleanup pass: expire messages, reap stale relationships, and
    optionally reap stale rooms.

    Commits once at the end. Message expiration and connection cleanup always
    run; room cleanup runs only when enabled. Inactive connections are reaped
    *before* the message scan so a connection about to be deleted doesn't also
    pay for a separate private-message scan (its messages cascade away with it).
    """
    result = CleanupResult()

    result.connections = await purge_inactive_connections(
        session, now=now, retention_days=connection_retention_days
    )

    if enable_room_cleanup:
        result.rooms = await purge_inactive_rooms(
            session, now=now, retention_days=room_retention_days
        )

    room_msgs, private_msgs = await purge_expired_messages(
        session, now=now, retention_hours=retention_hours
    )
    result.room_messages = room_msgs
    result.private_messages = private_msgs

    await session.commit()
    return result
