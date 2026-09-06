"""Single source of truth for VEXION runtime configuration.

Everything provider-related is read from environment variables here and nowhere
else. To swap a provider, change env values (or add a provider module under
backend/providers/) — never application code.
"""
import os
from typing import Any, Dict

APP_NAME = os.environ.get("APP_NAME", "VEXION")
APP_TAGLINE = os.environ.get("APP_TAGLINE", "Personal Intelligence Core")

# --- provider selection -----------------------------------------------------
# "emergent" -> real LLM via the Emergent universal key. "echo" -> mock responder.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "emergent")
LLM_MODEL = os.environ.get("LLM_MODEL", "claude-sonnet-4-5-20250929")
LLM_VENDOR = os.environ.get("LLM_VENDOR", "anthropic")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

DEFAULT_PERSONA = os.environ.get(
    "DEFAULT_PERSONA",
    "You are VEXION, a precise, calm, futuristic personal intelligence core. "
    "Address the user respectfully. Be accurate and concise, but never truncate a "
    "complete answer. Use GitHub-flavoured markdown, fenced code blocks with a "
    "language tag, LaTeX ($...$ inline, $$...$$ block) for mathematics, and "
    "```mermaid blocks for diagrams when a diagram genuinely helps.",
)


def _flag(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


# --- feature flags ----------------------------------------------------------
FEATURES: Dict[str, bool] = {
    "voice_input": _flag("FEATURE_VOICE_INPUT"),
    "voice_output": _flag("FEATURE_VOICE_OUTPUT"),
    "vision": _flag("FEATURE_VISION", "false"),
    "web_search": _flag("FEATURE_WEB_SEARCH", "false"),
    "image_generation": _flag("FEATURE_IMAGE_GENERATION", "false"),
    "guest_mode": _flag("FEATURE_GUEST_MODE"),
}


def public_config() -> Dict[str, Any]:
    """Config safe to expose to the browser. Never include secrets."""
    provider_ready = LLM_PROVIDER != "echo" and bool(EMERGENT_LLM_KEY)
    return {
        "app_name": APP_NAME,
        "app_tagline": APP_TAGLINE,
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL if provider_ready else "mock-echo",
        "provider_ready": provider_ready,
        "mocked": not provider_ready,
        "features": FEATURES,
    }
