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
            "60 messages/day · 800/month",
            "5 Tavily researches/day · 40/month",
            "250 MB storage · 20 MB research cache",
            "Projects, image generation, voice",
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
            "Solace (tier 4) and Groq Volt",
            "400 messages/day · 6,000/month",
            "40 Tavily researches/day · 400/month",
            "5 GB storage · 200 MB research cache",
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
            "Aether 5.0 Apex (tier 5) — the sharpest core",
            "1,500 messages/day · 25,000/month",
            "120 Tavily researches/day · 1,500/month",
            "10 GB storage · 1 GB research cache",
        ],
    },
]

_BY_ID = {p["id"]: p for p in PLANS}
DEFAULT_PLAN = "free"


def get_plan(plan_id: Optional[str]) -> Dict[str, Any]:
    return _BY_ID.get(plan_id or DEFAULT_PLAN, _BY_ID[DEFAULT_PLAN])


def max_tier_for(plan_id: Optional[str]) -> int:
    return int(get_plan(plan_id)["max_tier"])
