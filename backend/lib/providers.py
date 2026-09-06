"""Provider abstraction layer — UI -> app logic -> brain -> provider.

A provider implements `stream(system, history)` and yields text deltas.
Register new providers in `get_provider()`; nothing else in the app knows a
provider's name.
"""
from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, List

from lib import config


class ChatProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def stream(self, system: str, history: List[Dict[str, str]]) -> AsyncIterator[str]:
        """Yield response text deltas. history = [{role, content}, ...]."""
        raise NotImplementedError
        yield ""  # pragma: no cover


class EchoProvider(ChatProvider):
    """MOCK responder. Used when no real provider is configured."""

    name = "echo"

    async def stream(self, system: str, history: List[Dict[str, str]]) -> AsyncIterator[str]:
        last = history[-1]["content"] if history else ""
        text = (
            "> **MOCK MODE** — no AI provider is connected. This is a local echo responder.\n\n"
            f"You said: {last}\n\n"
            "Configure `LLM_PROVIDER` and `EMERGENT_LLM_KEY` in `backend/.env` to enable the real brain."
        )
        for token in text.split(" "):
            yield token + " "


class EmergentProvider(ChatProvider):
    """Real LLM via the Emergent universal key (OpenAI / Anthropic / Gemini)."""

    name = "emergent"

    async def stream(self, system: str, history: List[Dict[str, str]]) -> AsyncIterator[str]:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

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
        ).with_model(config.LLM_VENDOR, config.LLM_MODEL)

        async for event in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(event, TextDelta):
                yield event.content
            elif isinstance(event, StreamDone):
                break


_REGISTRY = {"echo": EchoProvider, "emergent": EmergentProvider}


def get_provider() -> ChatProvider:
    if config.LLM_PROVIDER == "emergent" and not config.EMERGENT_LLM_KEY:
        return EchoProvider()
    return _REGISTRY.get(config.LLM_PROVIDER, EchoProvider)()
