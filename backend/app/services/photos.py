"""Photo messages: persist a photo + its owning message, and load bytes to serve.

A photo message is a ``RoomMessage``/``PrivateMessage`` with ``kind='photo'`` and
NULL ``content``, plus one ``message_photos`` row holding the (already sanitized)
bytes. The photo's ``id`` is the unguessable token used in the serving URL.

Loading for serving is the only place the deferred ``data`` column is read, and
it re-checks the parent message's retention cutoff so an expired-but-not-yet-swept
photo 404s instead of leaking past its 24 h life.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.models.chat_room import ChatRoom
from app.models.message_photo import MessagePhoto
from app.models.private_message import PrivateMessage
from app.models.room_message import RoomMessage
from app.services import dm as dm_service


def photo_url(token: uuid.UUID) -> str:
    """Backend-relative serving path for a photo token (client prepends its API
    base and fetches it auth-gated). Kept here so both surfaces build it the same
    way."""
    return f"/photos/{token}"


async def create_room_photo_message(
    session: AsyncSession,
    *,
    room_id: uuid.UUID,
    sender_id: uuid.UUID,
    data: bytes,
    content_type: str,
) -> tuple[RoomMessage, MessagePhoto]:
    """Insert a photo message into a room and its photo row. Does not commit."""
    msg = RoomMessage(room_id=room_id, sender_id=sender_id, kind="photo", content=None)
    session.add(msg)
    await session.flush()  # assign msg.id

    photo = MessagePhoto(
        room_message_id=msg.id,
        data=data,
        content_type=content_type,
        byte_size=len(data),
    )
    session.add(photo)
    await session.flush()  # assign photo.id (the URL token)

    await session.execute(
        update(ChatRoom).where(ChatRoom.id == room_id).values(last_message_at=func.now())
    )
    await session.refresh(msg)
    return msg, photo


async def create_dm_photo_message(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    sender_id: uuid.UUID,
    data: bytes,
    content_type: str,
) -> tuple[PrivateMessage, MessagePhoto]:
    """Insert a photo message into a DM connection and its photo row. Bumps the
    connection's activity clock (like a text send). Does not commit."""
    msg = PrivateMessage(
        connection_id=connection_id, sender_id=sender_id, kind="photo", content=None
    )
    session.add(msg)
    await session.flush()  # assign msg.id

    photo = MessagePhoto(
        private_message_id=msg.id,
        data=data,
        content_type=content_type,
        byte_size=len(data),
    )
    session.add(photo)
    await session.flush()

    await dm_service.touch_connection(session, connection_id)
    await session.refresh(msg)
    return msg, photo


async def load_photo_for_serving(
    session: AsyncSession, *, token: uuid.UUID, viewer_id: uuid.UUID, cutoff: datetime
) -> tuple[bytes, str] | None:
    """Load a photo's bytes for the serving route, enforcing authorization + TTL.

    Returns ``(data, content_type)`` or ``None`` (→ 404) when the token is
    unknown, the parent message has expired (``sent_at < cutoff``), or the viewer
    isn't allowed to see it. For a **DM** photo the viewer must be a participant
    of the connection; **room** photos are visible to any authenticated user.
    """
    photo = await session.scalar(
        select(MessagePhoto)
        .options(undefer(MessagePhoto.data))
        .where(MessagePhoto.id == token)
    )
    if photo is None:
        return None

    if photo.room_message_id is not None:
        msg = await session.get(RoomMessage, photo.room_message_id)
        if msg is None or msg.sent_at < cutoff:
            return None
        # Room photos: any authenticated viewer may fetch.
        return photo.data, photo.content_type

    # DM photo — participant check.
    msg = await session.get(PrivateMessage, photo.private_message_id)
    if msg is None or msg.sent_at < cutoff:
        return None
    conn = await dm_service.get_connection(session, msg.connection_id)
    if conn is None or not dm_service.is_participant(conn, viewer_id):
        return None
    return photo.data, photo.content_type
