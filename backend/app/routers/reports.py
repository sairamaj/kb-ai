"""
Admin-only report endpoints (REP-01).

All routes require administrator role via CurrentAdmin. Non-admins receive HTTP 403.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentAdmin
from app import config as app_config
from app.database import get_db
from app.models import Collection, Conversation, User

router = APIRouter(prefix="/admin/reports", tags=["reports"])


# ---------------------------------------------------------------------------
# User report (REP-03, REP-04, REP-05)
# ---------------------------------------------------------------------------

class UserReportRow(BaseModel):
    """One row in the user report: identifier, role, counts, and optional activity fields."""

    id: uuid.UUID
    email: str
    display_name: str
    role: str
    collection_count: int
    conversation_count: int
    last_accessed_at: str | None  # ISO8601 or null if not tracked yet
    visit_count: int  # number of logins (or 0 if not tracked)


# ---------------------------------------------------------------------------
# Model and costs report (REP-06, REP-07)
# ---------------------------------------------------------------------------

class ModelReportRow(BaseModel):
    """One row in the model report: model id and configured unit cost (USD per 1K tokens)."""

    model: str
    cost_per_1k_tokens: float | None  # configured cost, or null if not set


@router.get("/models", response_model=list[ModelReportRow])
async def get_models_report(
    _admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[ModelReportRow]:
    """
    Admin-only model and costs report (REP-06, REP-07).

    Returns one row per model in use: distinct Conversation.model plus models
    used by chat and help (from config KNOWN_MODELS). Each row includes
    model identifier and current configured cost per 1K tokens (USD), or null
    if not configured. Cost values are defined in app.config and can be
    overridden via env (e.g. MODEL_COST_GPT_4O_MINI).
    """
    stmt = select(Conversation.model).distinct()
    result = await db.execute(stmt)
    db_models = {row[0] for row in result.all()}
    all_models = sorted(db_models | set(app_config.KNOWN_MODELS))
    rows = [
        ModelReportRow(
            model=mid,
            cost_per_1k_tokens=app_config.get_model_cost_per_1k_tokens(mid),
        )
        for mid in all_models
    ]
    return rows


@router.get("")
async def get_reports_scaffold(_admin: CurrentAdmin) -> dict:
    """
    Scaffold endpoint for admin reports. Confirms admin access.
    Phase 1: no report data yet; used to verify 403 for non-admins.
    """
    return {"scope": "admin", "reports": True}


@router.get("/users", response_model=list[UserReportRow])
async def get_users_report(
    _admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[UserReportRow]:
    """
    Admin-only user report (REP-03, REP-04, REP-05).

    Returns one row per user with: id, email, display_name, role,
    collection_count, conversation_count, last_accessed_at (optional),
    visit_count (optional). Uses existing User, Collection, Conversation models.
    """
    conv_count = select(func.count(Conversation.id)).where(Conversation.owner_id == User.id).scalar_subquery()
    coll_count = select(func.count(Collection.id)).where(Collection.owner_id == User.id).scalar_subquery()
    stmt = select(User, conv_count.label("conversation_count"), coll_count.label("collection_count"))
    result = await db.execute(stmt)
    rows: list[UserReportRow] = []
    for user, conv_count_val, coll_count_val in result.all():
        last_accessed = user.last_accessed_at.isoformat() if user.last_accessed_at else None
        visit_count_val = user.visit_count
        rows.append(
            UserReportRow(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                role=user.role.value,
                collection_count=coll_count_val or 0,
                conversation_count=conv_count_val or 0,
                last_accessed_at=last_accessed,
                visit_count=visit_count_val,
            )
        )
    return rows
