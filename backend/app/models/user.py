import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Index,
    LargeBinary,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import UserRole, UserStatus
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str | None] = mapped_column(String(50), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(100))

    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            native_enum=True,
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=False,
        server_default=UserRole.USER.value,
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(
            UserStatus,
            name="user_status",
            native_enum=True,
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=False,
        server_default=UserStatus.ACTIVE.value,
    )
    is_email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    # Profile photo stored inline in the DB (small images, MVP). The bytes are
    # deferred so they're never loaded on a normal user fetch — only the
    # dedicated avatar route selects them. `avatar_updated_at` doubles as the
    # "has a photo" flag and a cache-buster for the client's <img> URL.
    avatar_data: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    avatar_content_type: Mapped[str | None] = mapped_column(String(100))
    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    current_location: Mapped[str | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )
    current_geohash: Mapped[str | None] = mapped_column(String(12))
    location_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    @property
    def has_avatar(self) -> bool:
        # Uses the timestamp (always loaded) rather than the deferred bytes, so
        # checking it never triggers a load of the image data.
        return self.avatar_updated_at is not None

    __table_args__ = (
        Index("ix_users_current_geohash", "current_geohash"),
        Index(
            "ix_users_current_location_gist",
            "current_location",
            postgresql_using="gist",
        ),
    )
