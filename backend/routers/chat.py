"""Chat brain endpoint: SSE token streaming, provider-agnostic, tiered models.

Two lanes:
  * `/chat/{conversation_id}/stream` — signed in. History and replies persist.
  * `/chat/guest/stream`             — no account. The client owns the history,
                                       nothing is written to the database, and
                                       only the free tier-1 model is allowed.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lib import config
from lib.db import db
from lib.entitlements import bump, count, day_key, limits_for, month_key, tier_ceiling
from lib.models_catalog import FREE_MODEL_ID, get_model, is_available
from lib.providers import get_provider
from lib.security import current_user
from models.schemas import AttachmentRef, Message, Persona, SendMessageRequest

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_HISTORY = 40


class GuestTurn(BaseModel):
    role: str
    content: str


class GuestStreamRequest(BaseModel):
    content: str = Field(min_length=1)
    history: List[GuestTurn] = Field(default_factory=list)


def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_system(persona: Persona) -> str:
    parts = [config.DEFAULT_PERSONA, f"Tone: {persona.tone}. Verbosity: {persona.verbosity}."]
    if persona.system_prompt.strip():
        parts.append("Operator directives: " + persona.system_prompt.strip())
    return "\n\n".join(parts)


def _resolve_model(
    model_id: Optional[str], authenticated: bool, user: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """The authoritative entitlement check — the UI's locks are cosmetic."""
    spec = get_model(model_id)
    if spec["requires_auth"] and not authenticated:
        raise HTTPException(
            status_code=403,
            detail=f"{spec['name']} requires an account. Sign in to unlock tier {spec['tier']}.",
        )
    if not is_available(spec):
        raise HTTPException(
            status_code=503,
            detail=f"{spec['name']} is unavailable — its provider key is not configured.",
        )
    if authenticated and user is not None and spec["tier"] > tier_ceiling(user):
        raise HTTPException(
            status_code=402,
            detail=f"{spec['name']} (tier {spec['tier']}) needs a higher plan. Upgrade to use it.",
        )
    return spec


async def _check_ai_quota(user: Dict[str, Any]) -> None:
    lim = limits_for(user)
    if await count("ai", user["id"], day_key()) >= lim["ai_daily"]:
        raise HTTPException(status_code=429, detail=f"Daily AI limit reached ({lim['ai_daily']}).")
    if await count("ai", user["id"], month_key()) >= lim["ai_monthly"]:
        raise HTTPException(
            status_code=429, detail=f"Monthly AI limit reached ({lim['ai_monthly']})."
        )


async def _load_attachments(ids: List[str], user_id: str) -> tuple[List[str], str, List[Dict[str, str]]]:
    """Returns (base64 images, extracted document text, refs for the message)."""
    images: List[str] = []
    doc_text: List[str] = []
    refs: List[Dict[str, str]] = []
    for aid in ids[:6]:
        doc = await db.attachments.find_one({"id": aid})
        if not doc:
            continue
        owner = doc.get("user_id")
        if owner and owner != user_id:
            raise HTTPException(status_code=403, detail="Not your attachment")
        refs.append({"id": doc["id"], "kind": doc["kind"], "filename": doc["filename"]})
        if doc["kind"] == "image" and doc.get("data_url"):
            images.append(doc["data_url"].split(",", 1)[-1])
        elif doc.get("extracted_text"):
            doc_text.append(
                f"### ATTACHED DOCUMENT: {doc['filename']}\n{doc['extracted_text'][:60000]}"
            )
    return images, "\n\n".join(doc_text), refs


@router.post("/guest/stream")
async def stream_guest(payload: GuestStreamRequest):
    """Anonymous chat. Nothing is persisted — memory needs an account."""
    spec = _resolve_model(FREE_MODEL_ID, authenticated=False)
    system = _build_system(Persona()) + (
        "\n\nThis is a guest session: nothing is remembered after the browser closes."
    )
    history = [{"role": t.role, "content": t.content} for t in payload.history[-MAX_HISTORY:]]
    history.append({"role": "user", "content": payload.content})
    provider = get_provider(spec["vendor"])
    message_id = Message(conversation_id="guest", role="assistant", content="").id

    async def generator() -> AsyncIterator[str]:
        yield _sse(
            "start",
            {
                "user_message": {
                    "id": f"guest-{message_id}",
                    "conversation_id": "guest",
                    "role": "user",
                    "content": payload.content,
                    "status": "complete",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
                "message_id": message_id,
                "provider": provider.name,
                "model": spec["name"],
            },
        )
        status = "complete"
        try:
            async for delta in provider.stream(system, history, spec["vendor"], spec["model"]):
                yield _sse("delta", {"message_id": message_id, "text": delta})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            status = "error"
            yield _sse("error", {"message_id": message_id, "detail": str(exc)})
        yield _sse("done", {"message_id": message_id, "status": status})

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.post("/{conversation_id}/stream")
async def stream_chat(
    conversation_id: str,
    payload: SendMessageRequest,
    user: Dict[str, Any] = Depends(current_user),
):
    convo = await db.conversations.find_one({"id": conversation_id, "user_id": user["id"]})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    spec = _resolve_model(payload.model_id, authenticated=True, user=user)
    await _check_ai_quota(user)
    await bump("ai", user["id"], day_key())
    await bump("ai", user["id"], month_key())

    images, doc_text, refs = await _load_attachments(payload.attachment_ids, user["id"])

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

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=payload.content,
        attachments=[AttachmentRef(**r) for r in refs],
    )
    await db.messages.insert_one(user_msg.model_dump())

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if convo.get("title") in (None, "", "New chat", "New session"):
        updates["title"] = payload.content.strip()[:60] or "New chat"
    await db.conversations.update_one({"id": conversation_id}, {"$set": updates})

    docs = (
        await db.messages.find({"conversation_id": conversation_id})
        .sort("created_at", 1)
        .to_list(2000)
    )
    history: List[Dict[str, str]] = [
        {"role": d["role"], "content": d["content"]} for d in docs[-MAX_HISTORY:]
    ]
    if doc_text and history:
        history[-1] = {
            "role": "user",
            "content": f"{doc_text}\n\n---\n\n{history[-1]['content']}",
        }

    persona = Persona(**user.get("persona", {}))
    system = _build_system(persona)

    # Project instructions apply to every chat inside that project.
    if convo.get("project_id"):
        project = await db.projects.find_one(
            {"id": convo["project_id"], "user_id": user["id"]}
        )
        if project and project.get("instructions"):
            system += (
                f"\n\nProject '{project['name']}' instructions: {project['instructions'].strip()}"
            )
    assistant = Message(
        conversation_id=conversation_id,
        role="assistant",
        content="",
        status="streaming",
        model_id=spec["id"],
    )
    provider = get_provider(spec["vendor"])

    async def generator() -> AsyncIterator[str]:
        buffer = ""
        status = "complete"
        yield _sse(
            "start",
            {
                "user_message": json.loads(user_msg.model_dump_json()),
                "message_id": assistant.id,
                "provider": provider.name,
                "model": spec["name"],
            },
        )
        try:
            async for delta in provider.stream(
                system, history, spec["vendor"], spec["model"], images
            ):
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
