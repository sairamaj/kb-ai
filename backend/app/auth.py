"""
Authentication and authorization helpers.

Reusable admin check (AUTHZ-05): Use the `CurrentAdmin` dependency on any
admin-only endpoint. It ensures the current user has role `administrator` and
returns the full User; non-admins receive HTTP 403. Example:

    from app.auth import CurrentAdmin

    @router.patch("/something")
    async def admin_only_action(_admin: CurrentAdmin, ...) -> ...:
        ...
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import JWT_ALGORITHM, JWT_EXPIRY_SECONDS, SECRET_KEY
from app.database import get_db
from app.models import User, UserRole


class TokenPayload(BaseModel):
    sub: str          # user UUID
    email: str
    display_name: str
    avatar_url: str | None


def create_access_token(
    user_id: uuid.UUID,
    email: str,
    display_name: str,
    avatar_url: str | None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=JWT_EXPIRY_SECONDS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "display_name": display_name,
        "avatar_url": avatar_url,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _verify_token(token: str) -> TokenPayload:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return TokenPayload(**data)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user(
    access_token: Annotated[str | None, Cookie()] = None,
    db: AsyncSession = Depends(get_db),
) -> TokenPayload:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = _verify_token(access_token)

    # Ensure the user still exists in the database (handles DB resets / stale cookies).
    try:
        user_id = uuid.UUID(payload.sub)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    result = await db.execute(select(User.id).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found; please log in again")

    return payload


CurrentUser = Annotated[TokenPayload, Depends(get_current_user)]


async def get_optional_user(
    access_token: Annotated[str | None, Cookie()] = None,
    db: AsyncSession = Depends(get_db),
) -> TokenPayload | None:
    """
    Return the current user if authenticated, else None.
    Use for endpoints that support both authenticated and unauthenticated access (e.g. help chat).
    """
    if not access_token:
        return None
    try:
        payload = _verify_token(access_token)
    except HTTPException:
        return None
    try:
        user_id = uuid.UUID(payload.sub)
    except ValueError:
        return None
    result = await db.execute(select(User.id).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        return None
    return payload


OptionalUser = Annotated[TokenPayload | None, Depends(get_optional_user)]


async def require_admin(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Require the current user to have the administrator role (AUTHZ-05).
    Use via the `CurrentAdmin` dependency on admin-only endpoints.
    Raises HTTP 403 if the user is not an administrator.
    """
    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user.sub)))
    user = result.scalar_one_or_none()
    if not user or user.role != UserRole.administrator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator role required",
        )
    return user


CurrentAdmin = Annotated[User, Depends(require_admin)]
