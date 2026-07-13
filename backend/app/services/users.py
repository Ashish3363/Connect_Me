"""Profile mutations for the authenticated user: display name, avatar, password.

Each helper operates on the caller's own `User` row (the router passes the
current user), so a user can only ever edit their own profile. Image bytes are
validated by their magic number — the declared content-type is never trusted —
and the canonical type is derived from the bytes themselves.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

# `sniff_image_type` / `ALLOWED_IMAGE_TYPES` now live in app.core.images (shared
# with chat photo uploads). Re-exported here so existing avatar callers/tests
# keep importing them from this module unchanged.
from app.core.images import ALLOWED_IMAGE_TYPES, sniff_image_type  # noqa: F401
from app.core.security import hash_password, verify_password
from app.models.user import User

# 2 MB cap on a stored avatar (MVP — keeps inline DB storage reasonable).
MAX_AVATAR_BYTES = 2 * 1024 * 1024


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
