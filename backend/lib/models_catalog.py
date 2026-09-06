"""The model catalog — every selectable brain, grouped by provider.

Adding, removing or repricing a model is a change to this list only. Tier 1 is
free and usable without an account; higher tiers need an account and a plan that
reaches that tier (see lib/plans.py). A model whose provider key is missing is
reported as `available: false` — never silently substituted.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

# provider id -> (label, icon key used by the frontend)
PROVIDERS: Dict[str, Dict[str, str]] = {
    "gemini": {"label": "Google Gemini", "icon": "gemini"},
    "anthropic": {"label": "Anthropic Claude", "icon": "claude"},
    "openai": {"label": "OpenAI", "icon": "openai"},
    "qwen": {"label": "Qwen", "icon": "qwen"},
    "groq": {"label": "Groq", "icon": "groq"},
}

# Direct (own-key) routes. If the env key is present the model is served straight
# from that provider's OpenAI-compatible endpoint, bypassing the shared key.
DIRECT: Dict[str, Dict[str, str]] = {
    "openai": {
        "env": "OPENAI_API_KEY",
        "base_url": "https://api.openai.com/v1",
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o"),
    },
    "anthropic": {
        "env": "ANTHROPIC_API_KEY",
        "base_url": "https://api.anthropic.com/v1",
        "model": os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
    },
    "gemini": {
        "env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
    },
    "groq": {
        "env": "GROQ_API_KEY",
        "base_url": "https://api.groq.com/openai/v1",
        "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
    },
    "qwen": {
        "env": "QWEN_API_KEY",
        "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "model": os.environ.get("QWEN_MODEL", "qwen-plus"),
    },
}


def direct_key(provider: str) -> str:
    cfg = DIRECT.get(provider)
    return os.environ.get(cfg["env"], "").strip() if cfg else ""

CATALOG: List[Dict[str, Any]] = [
    {
        "id": "lumen",
        "name": "Lumen 1.5 Air",
        "tier": 1,
        "tagline": "Fast, free, everyday answers",
        "provider": "gemini",
        "vendor": "gemini",
        "model": "gemini-3-flash-preview",
        "requires_auth": False,
        "plan_required": "free",
        "capabilities": ["chat", "markdown", "code"],
    },
    {
        "id": "quartz",
        "name": "Quartz 2.0 Swift",
        "tier": 2,
        "tagline": "Quick reasoning with a steadier hand",
        "provider": "anthropic",
        "vendor": "anthropic",
        "model": "claude-haiku-4-5-20251001",
        "requires_auth": True,
        "plan_required": "free",
        "capabilities": ["chat", "markdown", "code", "math"],
    },
    {
        "id": "volt",
        "name": "Volt 2.5 Turbo",
        "tier": 2,
        "tagline": "Groq-speed replies for quick iterations",
        "provider": "groq",
        "vendor": "groq",
        "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "requires_auth": True,
        "plan_required": "core",
        "capabilities": ["chat", "markdown", "code"],
        "needs_env": "GROQ_API_KEY",
    },
    {
        "id": "orion",
        "name": "Orion 3.0 Core",
        "tier": 3,
        "tagline": "Balanced generalist for daily work",
        "provider": "openai",
        "vendor": "openai",
        "model": "gpt-5.4",
        "requires_auth": True,
        "plan_required": "free",
        "capabilities": ["chat", "markdown", "code", "math", "diagrams"],
    },
    {
        "id": "solace",
        "name": "Solace 4.0 Deep",
        "tier": 4,
        "tagline": "Deep analysis, long structured answers",
        "provider": "anthropic",
        "vendor": "anthropic",
        "model": "claude-sonnet-4-6",
        "requires_auth": True,
        "plan_required": "core",
        "capabilities": ["chat", "markdown", "code", "math", "diagrams", "analysis"],
    },
    {
        "id": "aether",
        "name": "Aether 5.0 Apex",
        "tier": 5,
        "tagline": "The sharpest core — hardest problems",
        "provider": "anthropic",
        "vendor": "anthropic",
        "model": "claude-opus-4-6",
        "requires_auth": True,
        "plan_required": "pro",
        "capabilities": ["chat", "markdown", "code", "math", "diagrams", "analysis", "research"],
    },
]

FREE_MODEL_ID = "lumen"

_BY_ID = {m["id"]: m for m in CATALOG}


def is_available(spec: Dict[str, Any]) -> bool:
    """Available when this provider has its own key, or the shared key can serve it."""
    if direct_key(spec["provider"]):
        return True
    env = spec.get("needs_env")
    if env:
        return bool(os.environ.get(env, "").strip())
    return bool(os.environ.get("EMERGENT_LLM_KEY", "").strip())


def get_model(model_id: Optional[str]) -> Dict[str, Any]:
    return _BY_ID.get(model_id or FREE_MODEL_ID, _BY_ID[FREE_MODEL_ID])


def public_catalog() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in CATALOG:
        provider = PROVIDERS.get(m["provider"], {"label": m["provider"], "icon": "spark"})
        out.append(
            {
                "id": m["id"],
                "name": m["name"],
                "tier": m["tier"],
                "tagline": m["tagline"],
                "requires_auth": m["requires_auth"],
                "plan_required": m["plan_required"],
                "capabilities": m["capabilities"],
                "provider": m["provider"],
                "provider_label": provider["label"],
                "icon": provider["icon"],
                "premium": m["plan_required"] != "free",
                "available": is_available(m),
                "own_key": bool(direct_key(m["provider"])),
                "unavailable_reason": ""
                if is_available(m)
                else f"{provider['label']} key not configured on the server",
            }
        )
    return out
