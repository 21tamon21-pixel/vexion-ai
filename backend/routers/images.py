"""Image generation. Real provider call — Gemini image model via the universal key.

Returned as a data URL so the existing MessageRenderer image pipeline handles it
with no extra storage layer. Object storage is NOT configured; images live inside
the conversation document (documented in PROJECT_CONTEXT.md).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib import config
from lib.db import db
from lib.security import optional_user
from models.schemas import Message

router = APIRouter(prefix="/images", tags=["images"])

IMAGE_MODEL = "gemini-3.1-flash-image-preview"


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None


class ImageResponse(BaseModel):
    prompt: str
    data_url: str
    caption: str
    message_id: str | None = None


@router.post("/generate", response_model=ImageResponse)
async def generate_image(payload: ImageRequest, user: Dict[str, Any] | None = Depends(optional_user)):
    if not config.FEATURES["image_generation"]:
        raise HTTPException(status_code=503, detail="Image generation is disabled")
    if not config.EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="No image provider is configured")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    chat = LlmChat(
        api_key=config.EMERGENT_LLM_KEY,
        session_id=str(uuid.uuid4()),
        system_message="You generate images from the user's description.",
    ).with_model("gemini", IMAGE_MODEL)
    chat.with_params(modalities=["image", "text"])

    try:
        text, images = await chat.send_message_multimodal_response(
            UserMessage(text=payload.prompt)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Image provider failed: {exc}") from exc

    if not images:
        raise HTTPException(status_code=502, detail="The provider returned no image")

    img = images[0]
    data_url = f"data:{img.get('mime_type', 'image/png')};base64,{img['data']}"
    caption = (text or "").strip()

    message_id = None
    # Persist into the conversation only for signed-in operators (guests have no memory).
    if user and payload.conversation_id:
        convo = await db.conversations.find_one(
            {"id": payload.conversation_id, "user_id": user["id"]}
        )
        if convo:
            prompt_msg = Message(
                conversation_id=payload.conversation_id,
                role="user",
                content=f"/image {payload.prompt}",
            )
            await db.messages.insert_one(prompt_msg.model_dump())
            msg = Message(
                conversation_id=payload.conversation_id,
                role="assistant",
                content=f"{caption}\n\n![{payload.prompt}]({data_url})".strip(),
                model_id="image",
            )
            await db.messages.insert_one(msg.model_dump())
            await db.conversations.update_one(
                {"id": payload.conversation_id},
                {"$set": {"updated_at": datetime.now(timezone.utc)}},
            )
            message_id = msg.id

    return ImageResponse(
        prompt=payload.prompt, data_url=data_url, caption=caption, message_id=message_id
    )
