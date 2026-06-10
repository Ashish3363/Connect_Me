import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Index, SmallInteger, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    geohash: Mapped[str] = mapped_column(String(12), unique=True, nullable=False)
    precision: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("6")
    )
    center_location: Mapped[str] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False
    )
    name: Mapped[str | None] = mapped_column(String(100))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "ix_chat_rooms_center_location_gist",
            "center_location",
            postgresql_using="gist",
        ),
    )
