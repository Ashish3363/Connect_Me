import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PrivateMessage(Base):
    """An ephemeral message inside a NearbyConnection.

    Expires on the same retention window as room messages (the cleanup sweep and
    the retrieval cutoff both key on ``sent_at``). The parent connection
    out-lives its messages: a connection can hold zero messages and still be a
    live relationship.
    """

    __tablename__ = "private_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("nearby_connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # 'text' | 'photo'. A photo message has no text (``content`` is NULL) and owns
    # a row in ``message_photos``. Mirrors RoomMessage.
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="text"
    )
    # NULL for photo messages; the text body for text messages.
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Reserved for a future unread/read-receipt feature; unused in v1.
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_private_messages_connection_sent", "connection_id", "sent_at"),
        # Single-column index for the global expiration sweep (see room_message).
        Index("ix_private_messages_sent_at", "sent_at"),
    )
