"""Provider abstraction layer — UI -> app logic -> brain -> provider.

A provider implements `stream(system, history, vendor, model, images)` and yields
text deltas. Register new providers in `_REGISTRY`; nothing else in the app knows
a provider's name.
"""
from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, List, Optional

from lib import config


class ChatProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def stream(
        self,
        system: str,
        history: List[Dict[str, str]],
        vendor: str = "",
        model: str = "",
        images: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        """Yield response text deltas. `images` are bare base64 strings."""
        raise NotImplementedError
        yield ""  # pragma: no cover


class EchoProvider(ChatProvider):
    """MOCK responder. Used when no real provider is configured."""

    name = "echo"

    async def stream(
        self,
        system: str,
        history: List[Dict[str, str]],
        vendor: str = "",
        model: str = "",
        images: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        last = history[-1]["content"] if history else ""
        text = (
            "> **MOCK MODE** — no AI provider is connected. This is a local echo responder.\n\n"
            f"You said: {last}\n\n"
            + (f"Received {len(images)} image(s).\n\n" if images else "")
            + "Configure `LLM_PROVIDER` and `EMERGENT_LLM_KEY` in `backend/.env` to enable the real brain."
        )
        for token in text.split(" "):
            yield token + " "


class EmergentProvider(ChatProvider):
    """Real LLM via the Emergent universal key (OpenAI / Anthropic / Gemini)."""

    name = "emergent"

    async def stream(
        self,
        system: str,
        history: List[Dict[str, str]],
        vendor: str = "",
        model: str = "",
        images: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        from emergentintegrations.llm.chat import (
            ImageContent,
            LlmChat,
            StreamDone,
            TextDelta,
            UserMessage,
        )

        # History is replayed as a transcript because the library owns its own
        # per-session buffer; this keeps memory authoritative in our database.
        transcript = "\n\n".join(
            f"{'User' if m['role'] == 'user' else 'VEXION'}: {m['content']}" for m in history[:-1]
        )
        last = history[-1]["content"] if history else ""
        prompt = f"Conversation so far:\n{transcript}\n\nUser: {last}" if transcript else last

        chat = LlmChat(
            api_key=config.EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message=system,
        ).with_model(vendor or config.LLM_VENDOR, model or config.LLM_MODEL)

        message = (
            UserMessage(text=prompt, file_contents=[ImageContent(b64) for b64 in images])
            if images
            else UserMessage(text=prompt)
        )

        try:
            async for event in chat.stream_message(message):
                if isinstance(event, TextDelta):
                    yield event.content
                elif isinstance(event, StreamDone):
                    break
        except Exception as exc:
            text = str(exc)
            if "Budget has been exceeded" in text or "RateLimitError" in text:
                raise RuntimeError(
                    "The shared AI key has no credit left. Add your own provider key "
                    "(GROQ_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY) "
                    "to backend/.env and that provider's models start working immediately."
                ) from exc
            raise


class GroqProvider(ChatProvider):
    """Groq's OpenAI-compatible streaming API. Requires GROQ_API_KEY."""

    name = "groq"

    async def stream(
        self,
        system: str,
        history: List[Dict[str, str]],
        vendor: str = "",
        model: str = "",
        images: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        import json
        import os

        import httpx

        key = os.environ.get("GROQ_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GROQ_API_KEY is not configured on the server")

        messages = [{"role": "system", "content": system}] + [
            {"role": m["role"], "content": m["content"]} for m in history
        ]
        payload = {"model": model, "messages": messages, "stream": True}

        async with httpx.AsyncClient(timeout=180) as http:
            async with http.stream(
                "POST",
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            ) as res:
                if res.status_code >= 300:
                    body = await res.aread()
                    raise RuntimeError(f"Groq error {res.status_code}: {body[:200]!r}")
                async for line in res.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    chunk = line[6:].strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        delta = json.loads(chunk)["choices"][0]["delta"].get("content")
                    except Exception:
                        continue
                    if delta:
                        yield delta



class OpenAICompatProvider(ChatProvider):
    """Any OpenAI-compatible endpoint reached with the OWNER'S OWN key.

    Used for Groq, OpenAI, Gemini, Anthropic and Qwen when their key is present
    in the environment — no shared key, no per-provider SDK.
    """

    def __init__(self, provider: str) -> None:
        from lib.models_catalog import DIRECT, direct_key

        cfg = DIRECT[provider]
        self.name = f"direct:{provider}"
        self.base_url = cfg["base_url"]
        self.default_model = cfg["model"]
        self.key = direct_key(provider)
        self.anthropic = provider == "anthropic"

    async def stream(
        self,
        system: str,
        history: List[Dict[str, str]],
        vendor: str = "",
        model: str = "",
        images: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        import json

        import httpx

        if not self.key:
            raise RuntimeError(f"{self.name} has no API key configured")

        content: Any = history[-1]["content"] if history else ""
        if images:
            content = [{"type": "text", "text": content}] + [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b}"}}
                for b in images
            ]
        messages = (
            [{"role": "system", "content": system}]
            + [{"role": m["role"], "content": m["content"]} for m in history[:-1]]
            + [{"role": "user", "content": content}]
        )

        headers = {"Authorization": f"Bearer {self.key}"}
        if self.anthropic:
            headers = {"x-api-key": self.key, "anthropic-version": "2023-06-01"}

        payload = {
            # Direct routes use the model id from this provider's *_MODEL env var —
            # catalog ids belong to the shared-key gateway, not to the raw API.
            "model": self.default_model,
            "messages": messages,
            "stream": True,
            "max_tokens": 8192,
        }

        async with httpx.AsyncClient(timeout=240) as http:
            async with http.stream(
                "POST", f"{self.base_url}/chat/completions", headers=headers, json=payload
            ) as res:
                if res.status_code >= 300:
                    body = await res.aread()
                    raise RuntimeError(f"{self.name} error {res.status_code}: {body[:200]!r}")
                async for line in res.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    chunk = line[6:].strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        delta = json.loads(chunk)["choices"][0]["delta"].get("content")
                    except Exception:
                        continue
                    if delta:
                        yield delta


_REGISTRY = {"echo": EchoProvider, "emergent": EmergentProvider, "groq": GroqProvider}


def get_provider(vendor: str = "") -> ChatProvider:
    """Routing order: the provider's own key -> the shared key -> the mock.

    Own keys win so that a provider stays usable even if the shared key is out
    of credit, and so the owner can move off the shared key entirely.
    """
    from lib.models_catalog import DIRECT, direct_key

    if vendor in DIRECT and direct_key(vendor):
        return OpenAICompatProvider(vendor)
    if vendor == "groq":  # groq has no shared-key route at all
        return GroqProvider()
    if config.LLM_PROVIDER == "emergent" and not config.EMERGENT_LLM_KEY:
        return EchoProvider()
    return _REGISTRY.get(config.LLM_PROVIDER, EchoProvider)()
