"""
Fetch real cost/usage from AI providers for admin reports.

- OpenAI: GET /v1/organization/costs with group_by=line_item (real USD spend).
  Requires OPENAI_API_KEY; for cost data the key may need org admin/usage permissions.
- Gemini: No public usage/cost API; use configured unit costs only.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OPENAI_COSTS_URL = "https://api.openai.com/v1/organization/costs"
DEFAULT_COST_DAYS = 30


def _openai_api_key() -> str | None:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    return key or None


def _normalize_line_item(item: str) -> str:
    """Normalize for matching: lowercase, collapse spaces/dots to single dash."""
    if not item:
        return ""
    return item.lower().replace(" ", "-").replace(".", "-").strip()


def _match_model_to_line_item(model_id: str, line_item: str) -> bool:
    """True if model_id and line_item refer to the same model (for grouping)."""
    a = _normalize_line_item(model_id)
    b = _normalize_line_item(line_item)
    if a == b:
        return True
    # e.g. model gpt-4o-mini vs line_item "gpt-4o-mini" or "GPT-4o Mini"
    if a in b or b in a:
        return True
    return False


async def fetch_openai_costs(days: int = DEFAULT_COST_DAYS) -> dict[str, float]:
    """
    Fetch OpenAI organization costs grouped by line_item; return line_item -> total USD.

    Uses OPENAI_API_KEY. Returns empty dict if key missing or API returns an error
    (e.g. 403 when key lacks organization cost permission). Paginates through all buckets.
    """
    key = _openai_api_key()
    if not key:
        return {}

    start_time = int(time.time()) - (days * 24 * 60 * 60)
    base_params: dict[str, Any] = {
        "start_time": start_time,
        "bucket_width": "1d",
        "limit": min(180, max(1, days)),
        "group_by": "line_item",
    }
    aggregated: dict[str, float] = {}
    page: str | None = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params = dict(base_params)
            if page is not None:
                params["page"] = page
            try:
                resp = await client.get(
                    OPENAI_COSTS_URL,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    params=params,
                )
            except Exception as e:
                logger.warning("OpenAI costs request failed: %s", e)
                break

            if resp.status_code == 403:
                logger.info("OpenAI costs API returned 403 (key may lack org cost permission)")
                break
            if resp.status_code != 200:
                logger.warning("OpenAI costs API returned %s: %s", resp.status_code, resp.text[:500])
                break

            try:
                data = resp.json()
            except Exception as e:
                logger.warning("OpenAI costs response JSON error: %s", e)
                break

            buckets = data.get("data") if isinstance(data, dict) else data
            if not isinstance(buckets, list):
                break

            for bucket in buckets:
                if not isinstance(bucket, dict):
                    continue
                results = bucket.get("results") or []
                for r in results:
                    if not isinstance(r, dict):
                        continue
                    amount_obj = r.get("amount")
                    line_item = r.get("line_item")
                    if amount_obj is None or line_item is None:
                        continue
                    if isinstance(amount_obj, dict):
                        val = amount_obj.get("value")
                    else:
                        val = amount_obj
                    try:
                        value = float(val)
                    except (TypeError, ValueError):
                        continue
                    key_li = str(line_item).strip()
                    if key_li:
                        aggregated[key_li] = aggregated.get(key_li, 0.0) + value

            page = data.get("next_page") if isinstance(data, dict) else None
            if not page:
                break

    return aggregated


def openai_cost_for_model(model_id: str, line_item_costs: dict[str, float]) -> float | None:
    """
    Map a model id (e.g. gpt-4o-mini) to total real cost from OpenAI line_item aggregates.

    Returns the sum of costs for line items that match this model, or None if no match.
    """
    total = 0.0
    for line_item, amount in line_item_costs.items():
        if _match_model_to_line_item(model_id, line_item):
            total += amount
    return total if total else None
