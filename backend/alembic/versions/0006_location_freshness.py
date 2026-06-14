"""seed location freshness + geofence grace into app_settings

Revision ID: 0006_location_freshness
Revises: 0005_message_rate_limit
Create Date: 2026-06-14

Adds the two runtime-tunable knobs for location-freshness validation:

* ``location_freshness_seconds`` (default 300) — max age of a user's last GPS
  fix before location-sensitive actions require a fresh one.
* ``geofence_grace_seconds`` (default 180) — how long a connected user may stay
  outside the room radius before being removed (hysteresis vs. GPS wobble).

The application falls back to these same defaults when the rows are absent, so
the seed is for admin visibility/tunability rather than correctness.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0006_location_freshness"
down_revision: Union[str, None] = "0005_message_rate_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO app_settings (key, value, description) VALUES
            ('location_freshness_seconds', '300'::jsonb,
             'Max age (seconds) of a user''s last GPS fix before location-sensitive actions require a fresh one.'),
            ('geofence_grace_seconds', '180'::jsonb,
             'Seconds a connected user may remain outside a room''s geofence radius before being removed.')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM app_settings
        WHERE key IN ('location_freshness_seconds', 'geofence_grace_seconds')
        """
    )
