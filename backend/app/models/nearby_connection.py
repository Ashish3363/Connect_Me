import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NearbyConnection(Base):
    """A persistent, location-agnostic 1-to-1 relationship between two users.

    Created the first time the pair opens a private chat and reused forever
    after — the same connection is reopened whenever they cross paths again, in
    any room. The room only scopes a *live session* (the geofence gate); it is
    never stored here. ``last_interaction_at`` is bumped on every message send
    and on an in-range (re)connect, and the cleanup job reaps connections idle
    longer than ``connection_retention_days``. Messages live in
    ``private_messages`` and expire independently on the message-retention sweep.
    """

    __tablename__ = "nearby_connections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # Canonical ordering (user_a_id < user_b_id) + uniqueness gives exactly one
    # row per unordered pair, regardless of who initiates.
    user_a_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_b_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_interaction_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_nearby_connections_pair"),
        # Bare token — the metadata "ck" naming convention expands it to
        # ck_nearby_connections_user_a_lt_user_b (matching migration 0009).
        CheckConstraint(
            "user_a_id < user_b_id",
            name="user_a_lt_user_b",
        ),
        # Single-column index drives the inactivity sweep (idle-relationship reap).
        Index("ix_nearby_connections_last_interaction", "last_interaction_at"),
    )
