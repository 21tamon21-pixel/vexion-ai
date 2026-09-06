"""Pydantic v2 models. Each has a hand-written TS mirror in frontend/src/types.ts."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

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


class Subscription(BaseModel):
    plan_id: str = "free"
    status: str = "active"
    provider: str = "none"
    external_id: Optional[str] = None
    updated_at: datetime = Field(default_factory=_now)


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    created_at: datetime = Field(default_factory=_now)
    persona: Persona = Field(default_factory=Persona)
    subscription: "Subscription" = Field(default_factory=lambda: Subscription())
    owner: bool = False


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
    project_id: Optional[str] = None
    title: str = "New chat"
    pinned: bool = False
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None
    project_id: Optional[str] = None


class Project(BaseModel):
    """A ChatGPT-style project: shared instructions + knowledge for its chats."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    description: str = ""
    instructions: str = ""
    color: str = "clay"
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    instructions: str = ""
    color: str = "clay"


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    description: Optional[str] = None
    instructions: Optional[str] = None
    color: Optional[str] = None


class Attachment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    kind: Literal["image", "document"]
    filename: str
    mime_type: str
    size: int
    # images keep a data URL for rendering + multimodal input; documents keep text
    data_url: Optional[str] = None
    extracted_text: str = ""
    pages: Optional[int] = None
    created_at: datetime = Field(default_factory=_now)


class AttachmentRef(BaseModel):
    """What the client echoes back on send — never trust it for content."""

    id: str
    kind: Literal["image", "document"]
    filename: str


class PlanInfo(BaseModel):
    id: str
    name: str
    price_usd: float
    interval: str
    max_tier: int
    features: List[str]


class ModelUsage(BaseModel):
    model_id: str
    model_name: str
    messages: int
    approx_tokens: int


class UsageSummary(BaseModel):
    total_messages: int
    total_conversations: int
    total_projects: int
    images_generated: int
    approx_tokens: int
    by_model: List[ModelUsage]
    by_day: List[Dict[str, Any]]
    # entitlement + resource snapshot (see lib/entitlements.py)
    quotas: Dict[str, Any] = Field(default_factory=dict)
    storage: Dict[str, Any] = Field(default_factory=dict)
    cache: Dict[str, Any] = Field(default_factory=dict)


class PluginConnectionCreate(BaseModel):
    plugin_id: str
    label: str = Field(min_length=1, max_length=80)
    repo_url: str = ""
    branch: str = "main"
    site_url: str = ""
    scopes: List[str] = Field(default_factory=lambda: ["observe"])
    notes: str = ""


class PluginConnection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    plugin_id: str
    label: str
    repo_url: str = ""
    branch: str = "main"
    site_url: str = ""
    scopes: List[str] = Field(default_factory=list)
    notes: str = ""
    revoked: bool = False
    last_seen_at: Optional[datetime] = None
    events: int = 0
    created_at: datetime = Field(default_factory=_now)


class PluginConnectionWithToken(BaseModel):
    connection: PluginConnection
    token: str
    handshake_prompt: str


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete", "streaming", "stopped", "error"] = "complete"
    model_id: Optional[str] = None
    attachments: List["AttachmentRef"] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    # When set, the conversation is truncated at this message before resending
    # (edit-and-resend / regenerate).
    from_message_id: Optional[str] = None
    # Which catalog model answers this turn (see lib/models_catalog.py).
    model_id: Optional[str] = None
    # Uploaded attachment ids (see routers/attachments.py).
    attachment_ids: List[str] = Field(default_factory=list)


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
