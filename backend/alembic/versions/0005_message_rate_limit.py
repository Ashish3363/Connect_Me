"""seed message_rate_limit_per_minute into app_settings

Revision ID: 0005_message_rate_limit
Revises: 0004_email_password_auth
Create Date: 2026-06-14

Adds the runtime-tunable per-user message send limit (default 20 messages per
60s). The application falls back to 20 when the row is absent, so this seed is
for admin visibility/tunability rather than correctness.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0005_message_rate_limit"
down_revision: Union[str, None] = "0004_email_password_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO app_settings (key, value, description) VALUES
            ('message_rate_limit_per_minute', '20'::jsonb,
             'Max messages a single user may send per 60-second rolling window.')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM app_settings WHERE key = 'message_rate_limit_per_minute'"
    )
