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
from app.models import User


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
