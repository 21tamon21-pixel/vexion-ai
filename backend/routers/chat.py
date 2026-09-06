"""Chat brain endpoint: SSE token streaming, provider-agnostic."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from lib import config
from lib.db import db
from lib.providers import get_provider
from lib.security import current_user
from models.schemas import Message, Persona, SendMessageRequest

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_HISTORY = 40


def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_system(persona: Persona) -> str:
    parts = [config.DEFAULT_PERSONA, f"Tone: {persona.tone}. Verbosity: {persona.verbosity}."]
    if persona.system_prompt.strip():
        parts.append("Operator directives: " + persona.system_prompt.strip())
    return "\n\n".join(parts)


@router.post("/{conversation_id}/stream")
async def stream_chat(
    conversation_id: str,
    payload: SendMessageRequest,
    user: Dict[str, Any] = Depends(current_user),
):
    convo = await db.conversations.find_one({"id": conversation_id, "user_id": user["id"]})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Edit-and-resend / regenerate: drop everything from the anchor onwards.
    if payload.from_message_id:
        anchor = await db.messages.find_one(
            {"id": payload.from_message_id, "conversation_id": conversation_id}
        )
        if not anchor:
            raise HTTPException(status_code=404, detail="Message not found")
        await db.messages.delete_many(
            {"conversation_id": conversation_id, "created_at": {"$gte": anchor["created_at"]}}
        )

    user_msg = Message(conversation_id=conversation_id, role="user", content=payload.content)
    await db.messages.insert_one(user_msg.model_dump())

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if convo.get("title") in (None, "", "New session"):
        updates["title"] = payload.content.strip()[:60] or "New session"
    await db.conversations.update_one({"id": conversation_id}, {"$set": updates})

    docs = (
        await db.messages.find({"conversation_id": conversation_id})
        .sort("created_at", 1)
        .to_list(2000)
    )
    history: List[Dict[str, str]] = [
        {"role": d["role"], "content": d["content"]} for d in docs[-MAX_HISTORY:]
    ]

    persona = Persona(**user.get("persona", {}))
    system = _build_system(persona)
    assistant = Message(conversation_id=conversation_id, role="assistant", content="", status="streaming")
    provider = get_provider()

    async def generator() -> AsyncIterator[str]:
        buffer = ""
        status = "complete"
        yield _sse(
            "start",
            {
                "user_message": json.loads(user_msg.model_dump_json()),
                "message_id": assistant.id,
                "provider": provider.name,
                "model": config.public_config()["model"],
            },
        )
        try:
            async for delta in provider.stream(system, history):
                buffer += delta
                yield _sse("delta", {"message_id": assistant.id, "text": delta})
        except asyncio.CancelledError:
            status = "stopped"
            raise
        except Exception as exc:  # provider failure must be visible, not faked
            status = "error"
            buffer += f"\n\n> **Provider error** — {type(exc).__name__}: {exc}"
            yield _sse("error", {"message_id": assistant.id, "detail": str(exc)})
        finally:
            assistant.content = buffer
            assistant.status = status
            await db.messages.insert_one(assistant.model_dump())
            await db.conversations.update_one(
                {"id": conversation_id}, {"$set": {"updated_at": datetime.now(timezone.utc)}}
            )
        yield _sse("done", {"message_id": assistant.id, "status": status})

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
