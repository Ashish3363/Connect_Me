"""indexes on message sent_at for efficient 24h expiration cleanup

Revision ID: 0007_message_expiration
Revises: 0006_location_freshness
Create Date: 2026-06-14

Message expiration deletes every message older than the retention window
(default 24h) across *all* rooms/conversations:

    DELETE FROM room_messages WHERE sent_at < :cutoff

The existing composite indexes are keyed by room/conversation first
(``ix_room_messages_room_sent`` = ``(room_id, sent_at)``), which Postgres can't
use for a global range scan on ``sent_at`` alone. These single-column indexes on
``sent_at`` let both the hourly cleanup DELETE and the retrieval-time
``sent_at >= cutoff`` filter run as index range scans rather than seq scans, so
cleanup stays cheap as the tables grow.

No columns are added — ``sent_at`` already exists on both message tables and
serves as the creation timestamp. Rooms, users, memberships and metadata are
untouched.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0007_message_expiration"
down_revision: Union[str, None] = "0006_location_freshness"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_room_messages_sent_at",
        "room_messages",
        ["sent_at"],
        unique=False,
    )
    op.create_index(
        "ix_private_messages_sent_at",
        "private_messages",
        ["sent_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_private_messages_sent_at", table_name="private_messages")
    op.drop_index("ix_room_messages_sent_at", table_name="room_messages")
