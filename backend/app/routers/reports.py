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
from app.provider_costs import fetch_openai_costs, openai_cost_for_model

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
    """One row in the model report: model id, configured unit cost, and optional real spend from provider."""

    model: str
    cost_per_1k_tokens: float | None  # configured cost (USD per 1K tokens), or null if not set
    real_cost_usd: float | None  # actual spend from provider (e.g. OpenAI) for the period, or null
    cost_period_label: str | None  # e.g. "Last 30 days" when real_cost_usd is present


@router.get("/models", response_model=list[ModelReportRow])
async def get_models_report(
    _admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[ModelReportRow]:
    """
    Admin-only model and costs report (REP-06, REP-07).

    Returns one row per model in use: distinct Conversation.model plus models
    from config KNOWN_MODELS. Each row includes:
    - model id, configured cost per 1K tokens (USD),
    - real_cost_usd when available (OpenAI: from organization costs API; Gemini: not available),
    - cost_period_label (e.g. "Last 30 days") when real spend is shown.
    """
    stmt = select(Conversation.model).distinct()
    result = await db.execute(stmt)
    db_models = {row[0] for row in result.all()}
    all_models = sorted(db_models | set(app_config.KNOWN_MODELS))

    # Fetch real costs from OpenAI when configured (same key as chat; may need org cost permission).
    openai_costs = await fetch_openai_costs()
    period_label = "Last 30 days" if openai_costs else None

    rows = []
    for mid in all_models:
        real_usd = openai_cost_for_model(mid, openai_costs)
        rows.append(
            ModelReportRow(
                model=mid,
                cost_per_1k_tokens=app_config.get_model_cost_per_1k_tokens(mid),
                real_cost_usd=real_usd,
                cost_period_label=period_label if real_usd is not None else None,
            )
        )
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
