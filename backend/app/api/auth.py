"""Auth routes: signup, login."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.schemas.auth import AuthOut, LoginIn, SignupIn
from app.schemas.user import UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AuthOut:
    try:
        user = await auth_service.register_user(
            session,
            email=body.email,
            password=body.password,
            username=body.username,
            display_name=body.display_name,
        )
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except auth_service.UsernameTakenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc

    access_token, expires_in = auth_service.issue_token_for_user(user)
    await session.commit()
    await session.refresh(user)
    return AuthOut(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=AuthOut)
async def login(
    body: LoginIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AuthOut:
    try:
        user = await auth_service.authenticate_user(
            session, email=body.email, password=body.password
        )
    except auth_service.InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except auth_service.UserNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc

    access_token, expires_in = auth_service.issue_token_for_user(user)
    return AuthOut(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )
