"""Profile mutations for the authenticated user: display name, avatar, password.

Each helper operates on the caller's own `User` row (the router passes the
current user), so a user can only ever edit their own profile. Image bytes are
validated by their magic number — the declared content-type is never trusted —
and the canonical type is derived from the bytes themselves.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User

# 2 MB cap on a stored avatar (MVP — keeps inline DB storage reasonable).
MAX_AVATAR_BYTES = 2 * 1024 * 1024

# Allowed image types, keyed by canonical content-type.
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def sniff_image_type(data: bytes) -> str | None:
    """Return the canonical content-type from the file's magic bytes.

    Only JPEG/PNG/WEBP are recognised; anything else returns None. We trust the
    bytes, not the client-supplied content-type header.
    """
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def update_display_name(
    session: AsyncSession, *, user: User, display_name: str
) -> User:
    user.display_name = display_name
    await session.flush()
    return user


async def set_avatar(
    session: AsyncSession, *, user: User, data: bytes, content_type: str
) -> User:
    user.avatar_data = data
    user.avatar_content_type = content_type
    user.avatar_updated_at = func.now()
    await session.flush()
    return user


async def change_password(
    session: AsyncSession, *, user: User, current_password: str, new_password: str
) -> bool:
    """Verify the current password, then set the new one. False if the current
    password is wrong (the caller maps that to a 400)."""
    if not verify_password(current_password, user.password_hash):
        return False
    user.password_hash = hash_password(new_password)
    await session.flush()
    return True
