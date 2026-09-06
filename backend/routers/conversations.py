from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.db import db
from lib.security import current_user
from models.schemas import (
    Conversation,
    ConversationDetail,
    ConversationUpdate,
    Message,
    SearchHit,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in doc.items() if k != "_id"}


async def owned(conversation_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.conversations.find_one({"id": conversation_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return doc


@router.get("", response_model=List[Conversation])
async def list_conversations(user: Dict[str, Any] = Depends(current_user)):
    docs = (
        await db.conversations.find({"user_id": user["id"]})
        .sort([("pinned", -1), ("updated_at", -1)])
        .to_list(500)
    )
    return [Conversation(**_clean(d)) for d in docs]


@router.post("", response_model=Conversation)
async def create_conversation(
    project_id: str | None = None, user: Dict[str, Any] = Depends(current_user)
):
    if project_id:
        owned_project = await db.projects.find_one({"id": project_id, "user_id": user["id"]})
        if not owned_project:
            raise HTTPException(status_code=404, detail="Project not found")
    convo = Conversation(user_id=user["id"], project_id=project_id)
    await db.conversations.insert_one(convo.model_dump())
    return convo


@router.get("/search", response_model=List[SearchHit])
async def search(q: str = Query(min_length=1), user: Dict[str, Any] = Depends(current_user)):
    convos = await db.conversations.find({"user_id": user["id"]}).to_list(500)
    by_id = {c["id"]: c for c in convos}
    hits: List[SearchHit] = []
    needle = q.lower()
    for c in convos:
        if needle in c["title"].lower():
            hits.append(SearchHit(conversation_id=c["id"], title=c["title"], snippet=c["title"]))
    msgs = await db.messages.find({"conversation_id": {"$in": list(by_id)}}).to_list(2000)
    seen = {h.conversation_id for h in hits}
    for m in msgs:
        if needle in m["content"].lower() and m["conversation_id"] not in seen:
            seen.add(m["conversation_id"])
            idx = m["content"].lower().index(needle)
            hits.append(
                SearchHit(
                    conversation_id=m["conversation_id"],
                    title=by_id[m["conversation_id"]]["title"],
                    snippet=m["content"][max(0, idx - 40) : idx + 80].strip(),
                )
            )
    return hits[:50]


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str, user: Dict[str, Any] = Depends(current_user)):
    convo = await owned(conversation_id, user)
    msgs = (
        await db.messages.find({"conversation_id": conversation_id})
        .sort("created_at", 1)
        .to_list(2000)
    )
    return ConversationDetail(
        conversation=Conversation(**_clean(convo)),
        messages=[Message(**_clean(m)) for m in msgs],
    )


@router.patch("/{conversation_id}", response_model=Conversation)
async def update_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    user: Dict[str, Any] = Depends(current_user),
):
    await owned(conversation_id, user)
    updates = payload.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.conversations.update_one({"id": conversation_id}, {"$set": updates})
    doc = await db.conversations.find_one({"id": conversation_id})
    return Conversation(**_clean(doc))


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user: Dict[str, Any] = Depends(current_user)):
    await owned(conversation_id, user)
    await db.messages.delete_many({"conversation_id": conversation_id})
    await db.conversations.delete_one({"id": conversation_id})
    return {"ok": True}
