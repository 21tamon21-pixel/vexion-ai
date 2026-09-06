"""Pydantic v2 models. Each has a hand-written TS mirror in frontend/src/types.ts."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Persona(BaseModel):
    system_prompt: str = ""
    tone: str = "precise"
    verbosity: str = "balanced"
    voice_enabled: bool = True
    auto_speak: bool = False
    voice_name: str = ""


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    created_at: datetime = Field(default_factory=_now)
    persona: Persona = Field(default_factory=Persona)


class SignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str = "New chat"
    pinned: bool = False
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete", "streaming", "stopped", "error"] = "complete"
    model_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    # When set, the conversation is truncated at this message before resending
    # (edit-and-resend / regenerate).
    from_message_id: Optional[str] = None
    # Which catalog model answers this turn (see lib/models_catalog.py).
    model_id: Optional[str] = None


class ConversationDetail(BaseModel):
    conversation: Conversation
    messages: List[Message]


class SearchHit(BaseModel):
    conversation_id: str
    title: str
    snippet: str


class PersonaUpdate(BaseModel):
    system_prompt: Optional[str] = None
    tone: Optional[str] = None
    verbosity: Optional[str] = None
    voice_enabled: Optional[bool] = None
    auto_speak: Optional[bool] = None
    voice_name: Optional[str] = None
