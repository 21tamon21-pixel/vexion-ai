"""Entitlements: what a given account may actually do, decided server-side.

One source of truth for plan limits, the owner override and quota counting.
Hiding a button is never the control — every premium call re-checks here.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from lib.db import db
from lib.plans import get_plan, max_tier_for

# Per-plan allowances. Storage/cache are byte budgets; the rest are call counts.
LIMITS: Dict[str, Dict[str, int]] = {
    "free": {
        "ai_daily": 60,
        "ai_monthly": 800,
        "tavily_daily": 5,
        "tavily_monthly": 40,
        "storage_bytes": 250 * 1024 * 1024,
        "cache_bytes": 20 * 1024 * 1024,
        "max_tier": 3,
    },
    "core": {
        "ai_daily": 400,
        "ai_monthly": 6000,
        "tavily_daily": 40,
        "tavily_monthly": 400,
        "storage_bytes": 5 * 1024 * 1024 * 1024,
        "cache_bytes": 200 * 1024 * 1024,
        "max_tier": 4,
    },
    "pro": {
        "ai_daily": 1500,
        "ai_monthly": 25000,
        "tavily_daily": 120,
        "tavily_monthly": 1500,
        "storage_bytes": 10 * 1024 * 1024 * 1024,
        "cache_bytes": 1024 * 1024 * 1024,
        "max_tier": 5,
    },
    "owner": {
        "ai_daily": 100000,
        "ai_monthly": 1000000,
        "tavily_daily": int(os.environ.get("TAVILY_OWNER_DAILY", "200")),
        "tavily_monthly": int(os.environ.get("TAVILY_OWNER_MONTHLY", "2000")),
        "storage_bytes": 20 * 1024 * 1024 * 1024,
        "cache_bytes": 2 * 1024 * 1024 * 1024,
        "max_tier": 5,
    },
}

# Project-wide safety net so the owner's Tavily credits cannot be drained.
GLOBAL_TAVILY_DAILY = int(os.environ.get("TAVILY_GLOBAL_DAILY", "150"))
GLOBAL_TAVILY_MONTHLY = int(os.environ.get("TAVILY_GLOBAL_MONTHLY", "900"))


def owner_code() -> str:
    """Read only on the server. Never returned by any endpoint."""
    return os.environ.get("OWNER_CODE", "").strip()


def effective_plan(user: Dict[str, Any]) -> str:
    if user.get("owner"):
        return "owner"
    return get_plan((user.get("subscription") or {}).get("plan_id", "free"))["id"]


def limits_for(user: Dict[str, Any]) -> Dict[str, int]:
    return LIMITS[effective_plan(user)]


def tier_ceiling(user: Dict[str, Any]) -> int:
    if user.get("owner"):
        return 5
    return max_tier_for((user.get("subscription") or {}).get("plan_id", "free"))


def day_key(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")


def month_key(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m")


def next_daily_reset() -> datetime:
    now = datetime.now(timezone.utc)
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


async def count(kind: str, user_id: str | None, scope: str) -> int:
    """scope is a day or month key; user_id None counts the whole project."""
    query: Dict[str, Any] = {"kind": kind, "scope": scope}
    query["user_id"] = user_id if user_id else {"$exists": True}
    doc = await db.quota_counters.find_one(query) if user_id else None
    if user_id:
        return int((doc or {}).get("value", 0))
    total = await db.quota_counters.aggregate(
        [{"$match": {"kind": kind, "scope": scope}}, {"$group": {"_id": None, "v": {"$sum": "$value"}}}]
    ).to_list(1)
    return int(total[0]["v"]) if total else 0


async def bump(kind: str, user_id: str, scope: str, by: int = 1) -> None:
    await db.quota_counters.update_one(
        {"kind": kind, "user_id": user_id, "scope": scope},
        {"$inc": {"value": by}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def usage_snapshot(user: Dict[str, Any]) -> Dict[str, Any]:
    lim = limits_for(user)
    d, m = day_key(), month_key()
    uid = user["id"]
    ai_d = await count("ai", uid, d)
    ai_m = await count("ai", uid, m)
    tv_d = await count("tavily", uid, d)
    tv_m = await count("tavily", uid, m)
    g_d = await count("tavily", None, d)
    g_m = await count("tavily", None, m)
    return {
        "plan": effective_plan(user),
        "owner": bool(user.get("owner")),
        "resets_at": next_daily_reset().isoformat(),
        "ai": {
            "daily_used": ai_d,
            "daily_limit": lim["ai_daily"],
            "monthly_used": ai_m,
            "monthly_limit": lim["ai_monthly"],
        },
        "tavily": {
            "daily_used": tv_d,
            "daily_limit": lim["tavily_daily"],
            "monthly_used": tv_m,
            "monthly_limit": lim["tavily_monthly"],
            "project_daily_used": g_d,
            "project_daily_limit": GLOBAL_TAVILY_DAILY,
            "project_monthly_used": g_m,
            "project_monthly_limit": GLOBAL_TAVILY_MONTHLY,
        },
        "limits": lim,
    }
