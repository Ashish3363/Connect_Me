"""photo messages: message_photos table + kind/nullable content on messages

Revision ID: 0010_message_photos
Revises: 0009_nearby_connections
Create Date: 2026-07-12

Adds single-photo messages to rooms and DMs (see
documentation/photo-messages-plan-2026-07-12.md):

* New ``message_photos`` table — image bytes in their own row, referenced by
  exactly one owning message (``room_message_id`` XOR ``private_message_id``),
  both FKs ``ON DELETE CASCADE`` so a photo dies with its message (the 24 h
  expiration sweep therefore also reaps the bytes — no separate photo cleanup).
  ``id`` (uuid) doubles as the unguessable URL token for the auth-gated
  ``GET /photos/{id}`` serving route.
* ``room_messages`` / ``private_messages`` grow a ``kind`` discriminator
  ('text' | 'photo', default 'text') and ``content`` becomes NULLABLE — a photo
  message carries no text. A CHECK keeps the two consistent: text ⇒ content set,
  photo ⇒ content NULL.

Existing rows are all text, so backfilling ``kind='text'`` (the server default)
and leaving ``content`` populated satisfies the new CHECK with no data changes.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_message_photos"
down_revision: Union[str, None] = "0009_nearby_connections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_MESSAGE_TABLES = ("room_messages", "private_messages")


def upgrade() -> None:
    # 1. kind discriminator + relax content to NULL on both message tables.
    for table in _MESSAGE_TABLES:
        op.add_column(
            table,
            sa.Column(
                "kind",
                sa.String(length=16),
                nullable=False,
                server_default="text",
            ),
        )
        op.alter_column(table, "content", existing_type=sa.Text(), nullable=True)
        op.create_check_constraint(
            f"ck_{table}_kind_content",
            table,
            "(kind = 'text' AND content IS NOT NULL) "
            "OR (kind = 'photo' AND content IS NULL)",
        )

    # 2. The photo bytes table.
    op.create_table(
        "message_photos",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("room_message_id", sa.BigInteger(), nullable=True),
        sa.Column("private_message_id", sa.BigInteger(), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_message_photos"),
        sa.ForeignKeyConstraint(
            ["room_message_id"],
            ["room_messages.id"],
            name="fk_message_photos_room_message_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["private_message_id"],
            ["private_messages.id"],
            name="fk_message_photos_private_message_id",
            ondelete="CASCADE",
        ),
        # Exactly one owning message.
        sa.CheckConstraint(
            "num_nonnulls(room_message_id, private_message_id) = 1",
            name="ck_message_photos_one_owner",
        ),
        # One photo per message (and the lookup index for CASCADE).
        sa.UniqueConstraint(
            "room_message_id", name="uq_message_photos_room_message_id"
        ),
        sa.UniqueConstraint(
            "private_message_id", name="uq_message_photos_private_message_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("message_photos")
    for table in _MESSAGE_TABLES:
        op.drop_constraint(f"ck_{table}_kind_content", table, type_="check")
        # Photo rows (if any) have NULL content; NULL them-out is impossible to
        # reverse cleanly, so downgrade assumes no photo messages remain.
        op.alter_column(table, "content", existing_type=sa.Text(), nullable=False)
        op.drop_column(table, "kind")
