"""switch from phone+OTP+refresh-token auth to email+password JWT auth

Revision ID: 0004_email_password_auth
Revises: 0003_refresh_tokens
Create Date: 2026-06-07

Drops:
- refresh_tokens table
- otp_verifications table
- users.phone_number column (and its unique index)
- users.is_phone_verified column
- app_settings rows for otp_expiry_seconds / otp_max_attempts (now dead)

Adds to users:
- email (varchar 255, unique, not null)
- password_hash (varchar 255, not null)
- is_email_verified (bool, default false)

Note: this migration assumes the `users` table is empty. If it has rows when
applied, the NOT NULL constraints on email/password_hash will fail. There were
no users at the time this migration was written.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_email_password_auth"
down_revision: Union[str, None] = "0003_refresh_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Drop tables that depend on users first (FK constraints) ---
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index(
        "ix_otp_verifications_phone_created", table_name="otp_verifications"
    )
    op.drop_table("otp_verifications")

    # --- Replace phone columns on users with email/password columns ---
    op.drop_constraint("uq_users_phone_number", "users", type_="unique")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "is_phone_verified")

    op.add_column(
        "users",
        sa.Column("email", sa.String(length=255), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_unique_constraint("uq_users_email", "users", ["email"])

    # --- Remove now-dead app_settings rows ---
    op.execute(
        "DELETE FROM app_settings "
        "WHERE key IN ('otp_expiry_seconds', 'otp_max_attempts')"
    )


def downgrade() -> None:
    # Re-seed the deleted app_settings rows.
    op.execute(
        """
        INSERT INTO app_settings (key, value, description) VALUES
            ('otp_expiry_seconds', '300'::jsonb,
             'How long an OTP is valid after it is issued.'),
            ('otp_max_attempts', '5'::jsonb,
             'Maximum verification attempts before an OTP is locked out.')
        ON CONFLICT (key) DO NOTHING
        """
    )

    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_column("users", "is_email_verified")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email")

    op.add_column(
        "users",
        sa.Column(
            "is_phone_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("phone_number", sa.String(length=20), nullable=False),
    )
    op.create_unique_constraint("uq_users_phone_number", "users", ["phone_number"])

    # Recreate otp_verifications and refresh_tokens (mirror of 0001 / 0003).
    from sqlalchemy.dialects import postgresql

    op.create_table(
        "otp_verifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("otp_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "attempts",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_otp_verifications_phone_created",
        "otp_verifications",
        ["phone_number", "created_at"],
    )

    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                ondelete="CASCADE",
                name="fk_refresh_tokens_user_id_users",
            ),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("user_agent", sa.String(255)),
        sa.Column("ip_address", postgresql.INET()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
