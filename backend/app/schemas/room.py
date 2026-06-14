import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StartRoomIn(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    # Optional first message that opens the room.
    message: str | None = Field(default=None, max_length=2000)


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    geohash: str
    distance_m: float
    members: int
    last_message_at: datetime | None


class RoomMessageOut(BaseModel):
    id: int
    room_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    content: str
    sent_at: datetime


class SendMessageIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class LocationUpdateIn(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class LocationStatusOut(BaseModel):
    fresh: bool
    within_geofence: bool
    distance_m: float
    radius_m: int
    location_updated_at: datetime
