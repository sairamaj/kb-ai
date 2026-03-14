"""
User management endpoints. Role changes are restricted to administrators (AUTHZ-04)
via the shared require-admin check (AUTHZ-05); see app.auth.CurrentAdmin.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentAdmin
from app.database import get_db
from app.models import User, UserRole

router = APIRouter(prefix="/users", tags=["users"])


class SetRoleBody(BaseModel):
    role: UserRole


@router.patch("/{user_id}/role")
async def set_user_role(
    user_id: uuid.UUID,
    body: SetRoleBody,
    _admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Set a user's role. Protected by CurrentAdmin (AUTHZ-05): only administrators
    can call this endpoint. Returns 403 for non-administrators; 404 if the target
    user does not exist.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.role = body.role
    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "email": user.email, "role": user.role.value}
