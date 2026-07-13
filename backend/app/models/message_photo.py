import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MessagePhoto(Base):
    """Image bytes for a photo message, one row per photo.

    Kept in its own table (not inline on the message row) so message-list
    queries never touch the bytes — the same "deferred" spirit as
    ``User.avatar_data``. Exactly one of ``room_message_id`` /
    ``private_message_id`` is set; both FKs are ``ON DELETE CASCADE`` so when the
    24 h expiration sweep deletes the parent message, the photo (and its bytes)
    go with it — no separate photo-cleanup job.

    ``id`` doubles as the **unguessable URL token**: photos are served from
    ``GET /photos/{id}`` (auth-gated). Message ids are sequential BIGINTs and must
    never appear in a photo URL.
    """

    __tablename__ = "message_photos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    room_message_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("room_messages.id", ondelete="CASCADE"),
        unique=True,
        nullable=True,
    )
    private_message_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("private_messages.id", ondelete="CASCADE"),
        unique=True,
        nullable=True,
    )
    # The (sanitized, re-encoded) image bytes. Deferred so a normal fetch never
    # loads them — only the dedicated serving route selects the column.
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # Exactly one owning message — a photo belongs to a room message XOR a
        # private message, never both and never neither.
        CheckConstraint(
            "num_nonnulls(room_message_id, private_message_id) = 1",
            name="ck_message_photos_one_owner",
        ),
    )
