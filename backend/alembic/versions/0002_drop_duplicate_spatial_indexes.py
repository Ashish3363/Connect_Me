"""drop GeoAlchemy2 auto-created spatial indexes (duplicates of our named ones)

Revision ID: 0002_drop_dupe_spatial_idx
Revises: 0001_baseline
Create Date: 2026-05-31

GeoAlchemy2's Geography type auto-creates a spatial index named
`idx_<table>_<column>` by default. Our models also defined explicit named
indexes (`ix_*_gist`) following the project naming convention, so we ended
up with two identical GIST indexes per spatial column. This migration drops
the auto-created ones; the models now pass `spatial_index=False` to prevent
the duplicates from being re-created.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0002_drop_dupe_spatial_idx"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_current_location")
    op.execute("DROP INDEX IF EXISTS idx_chat_rooms_center_location")


def downgrade() -> None:
    op.execute(
        "CREATE INDEX idx_users_current_location "
        "ON public.users USING gist (current_location)"
    )
    op.execute(
        "CREATE INDEX idx_chat_rooms_center_location "
        "ON public.chat_rooms USING gist (center_location)"
    )
