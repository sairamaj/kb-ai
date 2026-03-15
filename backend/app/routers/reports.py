"""
Admin-only report endpoints (REP-01).

All routes require administrator role via CurrentAdmin. Non-admins receive HTTP 403.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.auth import CurrentAdmin

router = APIRouter(prefix="/admin/reports", tags=["reports"])


@router.get("")
async def get_reports_scaffold(_admin: CurrentAdmin) -> dict:
    """
    Scaffold endpoint for admin reports. Confirms admin access.
    Phase 1: no report data yet; used to verify 403 for non-admins.
    """
    return {"scope": "admin", "reports": True}
