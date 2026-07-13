"""Photo serving + a shared upload-body helper.

The upload *endpoints* live under their surface routers (``/rooms/...`` and
``/rooms/{rid}/dm/...``) because they need that surface's location gate. This
module owns the cross-surface pieces: the single auth-gated serving route and the
read → size-check → sanitize helper both upload paths reuse.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_session
from app.core.config import get_settings
from app.core.images import (
    MAX_PHOTO_BYTES,
    InvalidImageError,
    sanitize_image,
)
from app.models.user import User
from app.services import photos as photos_service
from app.services.cleanup import expiry_cutoff

router = APIRouter(tags=["photos"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]


async def read_photo_body(request: Request) -> tuple[bytes, str]:
    """Read the raw image body, enforce the size cap, and sanitize it.

    Returns ``(clean_bytes, content_type)`` — the re-encoded, metadata-stripped
    image ready to store. Raises the appropriate HTTP error otherwise:
    400 empty, 413 too large, 415 not a supported/decodable image.
    """
    data = await request.body()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="empty image body"
        )
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"image exceeds {MAX_PHOTO_BYTES // (1024 * 1024)} MB limit",
        )
    try:
        return sanitize_image(data)
    except InvalidImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="unsupported image — use JPG, PNG, or WEBP",
        ) from exc


@router.get("/photos/{token}")
async def get_photo(token: uuid.UUID, user: UserDep, session: SessionDep) -> Response:
    """Serve a chat photo's bytes. **Auth-gated** — a valid JWT is required, and
    DM photos are restricted to the connection's participants. 404 when the token
    is unknown, the photo's message has expired, or the viewer isn't allowed."""
    cutoff = expiry_cutoff(
        datetime.now(timezone.utc), get_settings().message_retention_hours
    )
    result = await photos_service.load_photo_for_serving(
        session, token=token, viewer_id=user.id, cutoff=cutoff
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="photo not found"
        )
    data, content_type = result
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=300"},
    )
