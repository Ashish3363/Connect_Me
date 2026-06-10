from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    username: str | None = Field(default=None, min_length=3, max_length=50)
    display_name: str | None = Field(default=None, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
