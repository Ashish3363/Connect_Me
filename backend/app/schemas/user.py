import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

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
    # Whether the user has a profile photo, plus when it last changed (a
    # cache-buster the client appends to the avatar URL). Password hashes are
    # never part of this schema.
    has_avatar: bool = False
    avatar_updated_at: datetime | None = None


class ProfileUpdateIn(BaseModel):
    # Trim surrounding whitespace, then enforce the 3–30 char name rule.
    model_config = ConfigDict(str_strip_whitespace=True)

    display_name: str = Field(..., min_length=3, max_length=30)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=72)
    new_password: str = Field(..., min_length=8, max_length=72)
    confirm_password: str = Field(..., min_length=8, max_length=72)

    @model_validator(mode="after")
    def _passwords_match(self) -> "PasswordChangeIn":
        if self.new_password != self.confirm_password:
            raise ValueError("new_password and confirm_password do not match")
        return self
