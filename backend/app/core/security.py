"""JWT + password hashing helpers."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.enums import UserRole


# ---------- Password ----------


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# ---------- JWT ----------


def issue_access_token(*, user_id: uuid.UUID, role: UserRole) -> tuple[str, int]:
    """Returns (token, expires_in_seconds)."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=settings.access_token_ttl_seconds)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role.value,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, settings.access_token_ttl_seconds


class InvalidTokenError(Exception):
    pass


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"invalid token: {exc}") from exc
    if payload.get("type") != "access":
        raise InvalidTokenError("not an access token")
    return payload
