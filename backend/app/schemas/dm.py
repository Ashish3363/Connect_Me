import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StartDmIn(BaseModel):
    """Open (or reopen) the private connection with another user in this room."""

    other_user_id: uuid.UUID


class DmConnectionOut(BaseModel):
    """The persistent connection plus the *other* participant's display info, so
    the client can render the chat header without a second lookup."""

    id: uuid.UUID
    other_user_id: uuid.UUID
    other_user_name: str
    other_has_avatar: bool
    last_interaction_at: datetime
    # Whether the other person is currently reachable (fresh fix + inside the
    # querying room's geofence). Only meaningful when the list is fetched with a
    # room_id; False otherwise. Drives the green "in range" dot.
    in_range: bool = False
    # How many messages from the other person the caller hasn't read yet. Drives
    # the unread badge in the Personal Chats list.
    unread_count: int = 0


class DmMessageOut(BaseModel):
    id: int
    connection_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    content: str
    sent_at: datetime


class SendDmIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
