"""rename private DM tables to nearby_connections + persistent-relationship model

Revision ID: 0009_nearby_connections
Revises: 0008_user_avatar
Create Date: 2026-06-23

Reframes the (empty, never-used) private DM tables for the Nearby Private
Messaging feature, where a *connection* is a persistent, location-agnostic
relationship between two users and *messages* are ephemeral:

* ``private_conversations`` -> ``nearby_connections``.
* ``last_message_at`` (nullable) -> ``last_interaction_at`` (NOT NULL): bumped on
  every message send and on an in-range (re)connect, and indexed so the cleanup
  job can reap relationships idle for ``connection_retention_days`` (60 default).
* ``private_messages.conversation_id`` -> ``connection_id`` (FK now points at the
  renamed table; index/constraint renamed to match).

The connection carries no ``room_id`` — the room only scopes a live session, not
the relationship. Tables are empty in every environment, so the data backfill is
a no-op safety net.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_nearby_connections"
down_revision: Union[str, None] = "0008_user_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename the connection table and its constraints. (The original check
    # constraint name was mangled by the metadata naming convention into
    # ck_private_conversations_ck_private_conversations_user__0248.)
    op.rename_table("private_conversations", "nearby_connections")
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "pk_private_conversations TO pk_nearby_connections"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "uq_private_conversations_pair TO uq_nearby_connections_pair"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "ck_private_conversations_ck_private_conversations_user__0248 TO "
        "ck_nearby_connections_user_a_lt_user_b"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "fk_private_conversations_user_a_id_users TO "
        "fk_nearby_connections_user_a_id_users"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "fk_private_conversations_user_b_id_users TO "
        "fk_nearby_connections_user_b_id_users"
    )

    # 2. last_message_at -> last_interaction_at, NOT NULL with a now() default.
    op.alter_column(
        "nearby_connections", "last_message_at", new_column_name="last_interaction_at"
    )
    op.execute(
        "UPDATE nearby_connections "
        "SET last_interaction_at = COALESCE(last_interaction_at, created_at, now())"
    )
    op.alter_column(
        "nearby_connections",
        "last_interaction_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    op.create_index(
        "ix_nearby_connections_last_interaction",
        "nearby_connections",
        ["last_interaction_at"],
    )

    # 3. private_messages.conversation_id -> connection_id (+ index + FK name).
    op.alter_column(
        "private_messages", "conversation_id", new_column_name="connection_id"
    )
    op.execute(
        "ALTER INDEX ix_private_messages_conversation_sent "
        "RENAME TO ix_private_messages_connection_sent"
    )
    op.execute(
        "ALTER TABLE private_messages RENAME CONSTRAINT "
        "fk_private_messages_conversation_id_private_conversations TO "
        "fk_private_messages_connection_id_nearby_connections"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE private_messages RENAME CONSTRAINT "
        "fk_private_messages_connection_id_nearby_connections TO "
        "fk_private_messages_conversation_id_private_conversations"
    )
    op.execute(
        "ALTER INDEX ix_private_messages_connection_sent "
        "RENAME TO ix_private_messages_conversation_sent"
    )
    op.alter_column(
        "private_messages", "connection_id", new_column_name="conversation_id"
    )

    op.drop_index(
        "ix_nearby_connections_last_interaction", table_name="nearby_connections"
    )
    op.alter_column(
        "nearby_connections",
        "last_interaction_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
        server_default=None,
    )
    op.alter_column(
        "nearby_connections", "last_interaction_at", new_column_name="last_message_at"
    )

    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "fk_nearby_connections_user_b_id_users TO "
        "fk_private_conversations_user_b_id_users"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "fk_nearby_connections_user_a_id_users TO "
        "fk_private_conversations_user_a_id_users"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "ck_nearby_connections_user_a_lt_user_b TO "
        "ck_private_conversations_ck_private_conversations_user__0248"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "uq_nearby_connections_pair TO uq_private_conversations_pair"
    )
    op.execute(
        "ALTER TABLE nearby_connections RENAME CONSTRAINT "
        "pk_nearby_connections TO pk_private_conversations"
    )
    op.rename_table("nearby_connections", "private_conversations")
