"""The model catalog — five tiers of the VEXION brain.

Adding, removing or repricing a model is a change to this list only. Tier 1 is
free and usable without an account; tiers 2-5 require a signed-in operator and
are the hook for future subscription plans (`plan_required`).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

CATALOG: List[Dict[str, Any]] = [
    {
        "id": "lumen",
        "name": "Lumen",
        "tier": 1,
        "tagline": "Fast, free, everyday answers",
        "vendor": "gemini",
        "model": "gemini-3-flash-preview",
        "requires_auth": False,
        "plan_required": "free",
        "capabilities": ["chat", "markdown", "code"],
    },
    {
        "id": "quartz",
        "name": "Quartz",
        "tier": 2,
        "tagline": "Quick reasoning with a steadier hand",
        "vendor": "anthropic",
        "model": "claude-haiku-4-5-20251001",
        "requires_auth": True,
        "plan_required": "core",
        "capabilities": ["chat", "markdown", "code", "math"],
    },
    {
        "id": "orion",
        "name": "Orion",
        "tier": 3,
        "tagline": "Balanced generalist for daily work",
        "vendor": "openai",
        "model": "gpt-5.4",
        "requires_auth": True,
        "plan_required": "core",
        "capabilities": ["chat", "markdown", "code", "math", "diagrams"],
    },
    {
        "id": "solace",
        "name": "Solace",
        "tier": 4,
        "tagline": "Deep analysis, long structured answers",
        "vendor": "anthropic",
        "model": "claude-sonnet-4-6",
        "requires_auth": True,
        "plan_required": "pro",
        "capabilities": ["chat", "markdown", "code", "math", "diagrams", "analysis"],
    },
    {
        "id": "aether",
        "name": "Aether",
        "tier": 5,
        "tagline": "The sharpest core — hardest problems",
        "vendor": "anthropic",
        "model": "claude-opus-4-6",
        "requires_auth": True,
        "plan_required": "pro",
        "capabilities": ["chat", "markdown", "code", "math", "diagrams", "analysis", "research"],
    },
]

FREE_MODEL_ID = "lumen"

_BY_ID = {m["id"]: m for m in CATALOG}


def get_model(model_id: Optional[str]) -> Dict[str, Any]:
    return _BY_ID.get(model_id or FREE_MODEL_ID, _BY_ID[FREE_MODEL_ID])


def public_catalog() -> List[Dict[str, Any]]:
    return [
        {k: v for k, v in m.items() if k not in ("vendor", "model")} for m in CATALOG
    ]
