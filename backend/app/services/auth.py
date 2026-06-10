"""User registration, login, and token issuance for email+password auth."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserStatus
from app.core.security import (
    hash_password,
    issue_access_token,
    verify_password,
)
from app.models.user import User


class AuthError(Exception):
    pass


class EmailAlreadyRegisteredError(AuthError):
    pass


class UsernameTakenError(AuthError):
    pass


class InvalidCredentialsError(AuthError):
    pass


class UserNotAllowedError(AuthError):
    """Account exists but is banned/suspended/deleted."""


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def register_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    username: str | None = None,
    display_name: str | None = None,
) -> User:
    email_norm = _normalize_email(email)

    existing = await session.scalar(select(User).where(User.email == email_norm))
    if existing is not None:
        raise EmailAlreadyRegisteredError("email is already registered")

    user = User(
        email=email_norm,
        password_hash=hash_password(password),
        username=username,
        display_name=display_name,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        # Race: another request registered the same email/username between
        # the SELECT above and the INSERT, or the username collides.
        await session.rollback()
        if username and "username" in str(exc.orig).lower():
            raise UsernameTakenError("username is already taken") from exc
        raise EmailAlreadyRegisteredError("email is already registered") from exc

    return user


async def authenticate_user(
    session: AsyncSession, *, email: str, password: str
) -> User:
    email_norm = _normalize_email(email)
    user = await session.scalar(select(User).where(User.email == email_norm))
    # Always run bcrypt even on misses to keep response time uniform.
    if user is None:
        verify_password(password, "$2b$12$" + "x" * 53)
        raise InvalidCredentialsError("invalid email or password")

    if not verify_password(password, user.password_hash):
        raise InvalidCredentialsError("invalid email or password")

    if user.status in {UserStatus.BANNED, UserStatus.DELETED, UserStatus.SUSPENDED}:
        raise UserNotAllowedError(f"account is {user.status.value}")

    return user


def issue_token_for_user(user: User) -> tuple[str, int]:
    """Returns (access_token, expires_in_seconds)."""
    return issue_access_token(user_id=user.id, role=user.role)


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)
