"""add profile photo columns to users

Revision ID: 0008_user_avatar
Revises: 0007_message_expiration
Create Date: 2026-06-15

Adds inline avatar storage for the profile feature:

* ``avatar_data`` (BYTEA) — the image bytes, capped at 2 MB by the API.
* ``avatar_content_type`` (text) — canonical MIME type (image/jpeg|png|webp),
  derived from the bytes' magic number, not the client header.
* ``avatar_updated_at`` (timestamptz) — set whenever the photo changes; doubles
  as the "has a photo" flag and a cache-buster for the client <img> URL.

All nullable — existing users simply have no photo until they upload one.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_user_avatar"
down_revision: Union[str, None] = "0007_message_expiration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "users", sa.Column("avatar_content_type", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_updated_at")
    op.drop_column("users", "avatar_content_type")
    op.drop_column("users", "avatar_data")
