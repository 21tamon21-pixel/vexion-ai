"""Subscription plans. Prices are metadata — PayPal is the payment rail.

Changing a plan (price, tier ceiling, features) is an edit to this list only.
`max_tier` maps a plan onto the model catalog in lib/models_catalog.py.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

PLANS: List[Dict[str, Any]] = [
    {
        "id": "free",
        "name": "Free",
        "price_usd": 0.0,
        "interval": "forever",
        "max_tier": 3,
        "features": [
            "Lumen, Quartz and Orion (tiers 1-3)",
            "Unlimited saved chats and projects",
            "Image generation",
            "Voice input and output",
        ],
    },
    {
        "id": "core",
        "name": "Core",
        "price_usd": 12.0,
        "interval": "month",
        "max_tier": 4,
        "features": [
            "Everything in Free",
            "Solace (tier 4) for deep analysis",
            "Plugin connections for your own tools",
            "Priority streaming",
        ],
    },
    {
        "id": "pro",
        "name": "Pro",
        "price_usd": 29.0,
        "interval": "month",
        "max_tier": 5,
        "features": [
            "Everything in Core",
            "Aether (tier 5) — the sharpest core",
            "Unlimited plugin connections",
            "Early access to new capabilities",
        ],
    },
]

_BY_ID = {p["id"]: p for p in PLANS}
DEFAULT_PLAN = "free"


def get_plan(plan_id: Optional[str]) -> Dict[str, Any]:
    return _BY_ID.get(plan_id or DEFAULT_PLAN, _BY_ID[DEFAULT_PLAN])


def max_tier_for(plan_id: Optional[str]) -> int:
    return int(get_plan(plan_id)["max_tier"])
