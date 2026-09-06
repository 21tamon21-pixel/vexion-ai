"""Usage dashboard — counted from real message documents, nothing stubbed."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from lib.db import db
from lib.models_catalog import get_model
from lib.security import current_user
from models.schemas import ModelUsage, UsageSummary

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/summary", response_model=UsageSummary)
async def summary(user: Dict[str, Any] = Depends(current_user)):
    convos = await db.conversations.find({"user_id": user["id"]}).to_list(1000)
    convo_ids = [c["id"] for c in convos]
    projects = await db.projects.count_documents({"user_id": user["id"]})
    msgs = (
        await db.messages.find({"conversation_id": {"$in": convo_ids}}).to_list(20000)
        if convo_ids
        else []
    )

    per_model: Dict[str, Dict[str, int]] = defaultdict(lambda: {"messages": 0, "tokens": 0})
    per_day: Dict[str, int] = defaultdict(int)
    images = 0
    total_tokens = 0

    for m in msgs:
        approx = max(1, len(m.get("content", "")) // 4)
        total_tokens += approx
        day = str(m["created_at"])[:10]
        per_day[day] += 1
        if m.get("role") != "assistant":
            continue
        model_id = m.get("model_id") or "lumen"
        if model_id == "image":
            images += 1
            continue
        per_model[model_id]["messages"] += 1
        per_model[model_id]["tokens"] += approx

    by_model: List[ModelUsage] = [
        ModelUsage(
            model_id=mid,
            model_name=get_model(mid)["name"],
            messages=v["messages"],
            approx_tokens=v["tokens"],
        )
        for mid, v in sorted(per_model.items(), key=lambda kv: -kv[1]["messages"])
    ]
    by_day = [{"day": d, "messages": per_day[d]} for d in sorted(per_day)][-14:]

    return UsageSummary(
        total_messages=len(msgs),
        total_conversations=len(convos),
        total_projects=projects,
        images_generated=images,
        approx_tokens=total_tokens,
        by_model=by_model,
        by_day=by_day,
    )
