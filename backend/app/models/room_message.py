from datetime import datetime

import uuid

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoomMessage(Base):
    __tablename__ = "room_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # 'text' | 'photo'. A photo message has no text (``content`` is NULL) and owns
    # a row in ``message_photos``. Plain string + app-level check (no PG enum).
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="text"
    )
    # NULL for photo messages; the text body for text messages.
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Creation timestamp. Also the basis for 24h message expiration: the
    # retrieval API filters on it and the cleanup job deletes rows older than
    # the retention window. See documentation/message-expiration.md.
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_room_messages_room_sent", "room_id", "sent_at"),
        # Single-column index for the global "delete everything older than
        # cutoff" expiration sweep (the composite above is room-keyed).
        Index("ix_room_messages_sent_at", "sent_at"),
    )
