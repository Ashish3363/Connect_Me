import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.core.enums import UserRole, UserStatus


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    username: str | None
    display_name: str | None
    role: UserRole
    status: UserStatus
    is_email_verified: bool
    created_at: datetime
