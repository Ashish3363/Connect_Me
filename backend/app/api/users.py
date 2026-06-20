"""User profile endpoints — view and edit *your own* profile.

All mutating routes depend on `get_current_user`, so a user can only ever edit
their own profile; there is no path that takes another user's id to modify.
Password hashes are never returned (see `UserOut`). The avatar GET is the one
public route — it serves only image bytes so it can back an <img> tag.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_session
from app.models.user import User
from app.schemas.user import PasswordChangeIn, ProfileUpdateIn, UserOut
from app.services import users as users_service

router = APIRouter(prefix="/users", tags=["users"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]


@router.get("/count")
async def total_user_count(session: SessionDep) -> dict:
    """Public endpoint — total registered accounts. No auth required."""
    result = await session.execute(select(func.count()).select_from(User))
    return {"count": result.scalar_one()}


@router.get("/me", response_model=UserOut)
async def me(user: UserDep) -> User:
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: ProfileUpdateIn, user: UserDep, session: SessionDep
) -> User:
    """Update the caller's display name (3–30 chars, enforced by the schema)."""
    await users_service.update_display_name(
        session, user=user, display_name=body.display_name
    )
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    request: Request, user: UserDep, session: SessionDep
) -> User:
    """Replace the caller's profile photo.

    The raw image is sent as the request body (Content-Type set to the image
    type). We validate by magic bytes — not the header — and cap the size, then
    store the bytes inline. Re-uploading simply overwrites the previous photo.
    """
    data = await request.body()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="empty image body"
        )
    if len(data) > users_service.MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"image exceeds {users_service.MAX_AVATAR_BYTES // (1024 * 1024)} MB limit",
        )
    content_type = users_service.sniff_image_type(data)
    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="unsupported image type — use JPG, PNG, or WEBP",
        )
    await users_service.set_avatar(
        session, user=user, data=data, content_type=content_type
    )
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChangeIn, user: UserDep, session: SessionDep
) -> Response:
    """Change the caller's password after verifying the current one.

    The schema already enforced new == confirm and the length rules; here we
    only need to check the current password.
    """
    ok = await users_service.change_password(
        session,
        user=user,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="current password is incorrect",
        )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{user_id}/avatar")
async def get_avatar(user_id: uuid.UUID, session: SessionDep) -> Response:
    """Serve a user's profile photo. Public (image bytes only) so it can be the
    `src` of an <img>. 404 when the user has no photo."""
    row = (
        await session.execute(
            select(User.avatar_data, User.avatar_content_type).where(
                User.id == user_id
            )
        )
    ).first()
    if row is None or row.avatar_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="no avatar"
        )
    return Response(
        content=row.avatar_data,
        media_type=row.avatar_content_type or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=300"},
    )
