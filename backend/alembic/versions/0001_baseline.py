"""baseline: enable postgis + create all 8 tables

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-31

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


USER_ROLE_VALUES = ("admin", "user")
USER_STATUS_VALUES = ("active", "suspended", "banned", "deleted")
MODERATION_ACTION_VALUES = (
    "suspended",
    "banned",
    "unbanned",
    "deleted",
    "restored",
)


def upgrade() -> None:
    # 1. PostGIS extension (requires the connecting role to have CREATE on the DB
    # — `postgres` superuser does by default).
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    # pgcrypto for gen_random_uuid(); Postgres 13+ ships gen_random_uuid() in
    # core, but we enable pgcrypto explicitly for portability.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # 2. Enums
    user_role = postgresql.ENUM(*USER_ROLE_VALUES, name="user_role")
    user_status = postgresql.ENUM(*USER_STATUS_VALUES, name="user_status")
    moderation_action = postgresql.ENUM(
        *MODERATION_ACTION_VALUES, name="moderation_action"
    )
    user_role.create(op.get_bind(), checkfirst=True)
    user_status.create(op.get_bind(), checkfirst=True)
    moderation_action.create(op.get_bind(), checkfirst=True)

    # 3. users
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("username", sa.String(50)),
        sa.Column("display_name", sa.String(100)),
        sa.Column(
            "role",
            postgresql.ENUM(*USER_ROLE_VALUES, name="user_role", create_type=False),
            nullable=False,
            server_default="user",
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*USER_STATUS_VALUES, name="user_status", create_type=False),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "is_phone_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "current_location",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("current_geohash", sa.String(12)),
        sa.Column("location_updated_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("phone_number", name="uq_users_phone_number"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_current_geohash", "users", ["current_geohash"])
    op.create_index(
        "ix_users_current_location_gist",
        "users",
        ["current_location"],
        postgresql_using="gist",
    )

    # 4. otp_verifications
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

    # 5. app_settings
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_app_settings_updated_by_users"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # 6. user_moderation
    op.create_table(
        "user_moderation",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_user_moderation_user_id_users"),
            nullable=False,
        ),
        sa.Column(
            "action",
            postgresql.ENUM(
                *MODERATION_ACTION_VALUES, name="moderation_action", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.Text()),
        sa.Column(
            "performed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id", ondelete="RESTRICT", name="fk_user_moderation_performed_by_users"
            ),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column(
            "performed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_user_moderation_user_performed",
        "user_moderation",
        ["user_id", "performed_at"],
    )

    # 7. chat_rooms
    op.create_table(
        "chat_rooms",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("geohash", sa.String(12), nullable=False),
        sa.Column(
            "precision",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("6"),
        ),
        sa.Column(
            "center_location",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("name", sa.String(100)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("geohash", name="uq_chat_rooms_geohash"),
    )
    op.create_index(
        "ix_chat_rooms_center_location_gist",
        "chat_rooms",
        ["center_location"],
        postgresql_using="gist",
    )

    # 8. room_messages
    op.create_table(
        "room_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_rooms.id", ondelete="CASCADE", name="fk_room_messages_room_id_chat_rooms"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_room_messages_sender_id_users"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_room_messages_room_sent",
        "room_messages",
        ["room_id", "sent_at"],
    )

    # 9. private_conversations
    op.create_table(
        "private_conversations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_a_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_private_conversations_user_a_id_users"),
            nullable=False,
        ),
        sa.Column(
            "user_b_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_private_conversations_user_b_id_users"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "user_a_id", "user_b_id", name="uq_private_conversations_pair"
        ),
        sa.CheckConstraint(
            "user_a_id < user_b_id",
            name="ck_private_conversations_user_a_lt_user_b",
        ),
    )

    # 10. private_messages
    op.create_table(
        "private_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "private_conversations.id",
                ondelete="CASCADE",
                name="fk_private_messages_conversation_id_private_conversations",
            ),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_private_messages_sender_id_users"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_private_messages_conversation_sent",
        "private_messages",
        ["conversation_id", "sent_at"],
    )

    # 11. Seed app_settings with runtime-configurable defaults.
    # JSONB values: scalars are written as their JSON literal form.
    op.execute(
        """
        INSERT INTO app_settings (key, value, description) VALUES
            ('geofence_radius_meters',     '1000'::jsonb,
             'Max distance (m) between two users for them to be considered in range.'),
            ('default_geohash_precision',  '6'::jsonb,
             'Default geohash precision for public chat rooms (6 = ~1.2km x 0.6km cell).'),
            ('otp_expiry_seconds',         '300'::jsonb,
             'How long an OTP is valid after it is issued.'),
            ('otp_max_attempts',           '5'::jsonb,
             'Maximum verification attempts before an OTP is locked out.'),
            ('location_staleness_seconds', '300'::jsonb,
             'Locations older than this are treated as unknown / out of range.')
        """
    )


def downgrade() -> None:
    op.drop_index("ix_private_messages_conversation_sent", table_name="private_messages")
    op.drop_table("private_messages")

    op.drop_table("private_conversations")

    op.drop_index("ix_room_messages_room_sent", table_name="room_messages")
    op.drop_table("room_messages")

    op.drop_index("ix_chat_rooms_center_location_gist", table_name="chat_rooms")
    op.drop_table("chat_rooms")

    op.drop_index("ix_user_moderation_user_performed", table_name="user_moderation")
    op.drop_table("user_moderation")

    op.drop_table("app_settings")

    op.drop_index("ix_otp_verifications_phone_created", table_name="otp_verifications")
    op.drop_table("otp_verifications")

    op.drop_index("ix_users_current_location_gist", table_name="users")
    op.drop_index("ix_users_current_geohash", table_name="users")
    op.drop_table("users")

    bind = op.get_bind()
    postgresql.ENUM(name="moderation_action").drop(bind, checkfirst=True)
    postgresql.ENUM(name="user_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="user_role").drop(bind, checkfirst=True)
    # Leave PostGIS / pgcrypto extensions in place — they may be used elsewhere.
