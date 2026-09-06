"""Code Bridge — the outward half of the plugin, called by the operator's other
app with `Authorization: Bearer vxb_...`.

Scope-checked, size-capped, read-only with respect to the caller's repository:
VEXION answers and suggests, it never executes anything and never writes files.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib import config
from lib.db import db
from lib.models_catalog import get_model
from lib.plans import max_tier_for
from lib.providers import get_provider
from lib.security import bearer_connection

router = APIRouter(prefix="/bridge", tags=["bridge"])

MAX_PAYLOAD = 200_000


class ObserveRequest(BaseModel):
    kind: str = Field(default="note", max_length=32)
    path: str = Field(default="", max_length=400)
    summary: str = Field(default="", max_length=2000)
    content: str = ""


class BridgeFile(BaseModel):
    path: str = Field(max_length=400)
    content: str = ""


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    files: List[BridgeFile] = Field(default_factory=list)
    model_id: str | None = None


def _require(conn: Dict[str, Any], scope: str) -> None:
    if scope not in (conn.get("scopes") or []):
        raise HTTPException(
            status_code=403, detail=f"This connection does not have the '{scope}' scope"
        )


async def _touch(conn: Dict[str, Any], inc: int = 0) -> None:
    update: Dict[str, Any] = {"$set": {"last_seen_at": datetime.now(timezone.utc)}}
    if inc:
        update["$inc"] = {"events": inc}
    await db.plugin_connections.update_one({"id": conn["id"]}, update)


@router.get("/handshake")
async def handshake(conn: Dict[str, Any] = Depends(bearer_connection)):
    await _touch(conn)
    owner = await db.users.find_one({"id": conn["user_id"]})
    projects = await db.projects.find({"user_id": conn["user_id"]}).to_list(20)
    return {
        "app": config.APP_NAME,
        "connection": {
            "id": conn["id"],
            "label": conn["label"],
            "repo_url": conn.get("repo_url", ""),
            "branch": conn.get("branch", "main"),
            "site_url": conn.get("site_url", ""),
            "scopes": conn.get("scopes", []),
            "notes": conn.get("notes", ""),
        },
        "operator_persona": (owner or {}).get("persona", {}).get("system_prompt", ""),
        "projects": [{"name": p["name"], "instructions": p.get("instructions", "")} for p in projects],
        "rules": [
            "Only use the scopes listed on this connection.",
            "VEXION advises and suggests patches; it never edits or runs anything itself.",
            "Keep each payload under 200 KB.",
        ],
    }


@router.post("/observe")
async def observe(payload: ObserveRequest, conn: Dict[str, Any] = Depends(bearer_connection)):
    _require(conn, "observe")
    if len(payload.content) > MAX_PAYLOAD:
        raise HTTPException(status_code=413, detail="Payload larger than 200 KB")
    event = {
        "id": str(uuid.uuid4()),
        "connection_id": conn["id"],
        "user_id": conn["user_id"],
        "kind": payload.kind,
        "path": payload.path,
        "summary": payload.summary,
        "content": payload.content[:MAX_PAYLOAD],
        "created_at": datetime.now(timezone.utc),
    }
    await db.plugin_events.insert_one(event)
    await _touch(conn, inc=1)
    return {"ok": True, "event_id": event["id"]}


@router.post("/ask")
async def ask(payload: AskRequest, conn: Dict[str, Any] = Depends(bearer_connection)):
    _require(conn, "connect")
    total = sum(len(f.content) for f in payload.files)
    if total > MAX_PAYLOAD:
        raise HTTPException(status_code=413, detail="Attached files exceed 200 KB")

    owner = await db.users.find_one({"id": conn["user_id"]})
    plan_id = ((owner or {}).get("subscription") or {}).get("plan_id", "free")
    spec = get_model(payload.model_id)
    if spec["tier"] > max_tier_for(plan_id):
        raise HTTPException(
            status_code=402,
            detail=f"{spec['name']} needs a higher plan than the operator's current one",
        )

    may_edit = "edit" in (conn.get("scopes") or [])
    may_run = "run" in (conn.get("scopes") or [])
    system = "\n\n".join(
        [
            config.DEFAULT_PERSONA,
            f"You are answering through the Code Bridge for the project '{conn['label']}'"
            + (f" (repo {conn['repo_url']})." if conn.get("repo_url") else "."),
            "Give patch suggestions as unified diffs or full file blocks."
            if may_edit
            else "Do NOT produce file edits — explain what to change in prose.",
            "You may propose shell commands for the operator to review."
            if may_run
            else "Do NOT propose shell commands.",
            "You cannot execute anything yourself and you have no filesystem access.",
        ]
    )

    context = "\n\n".join(
        f"### FILE: {f.path}\n```\n{f.content[:40000]}\n```" for f in payload.files
    )
    recent = await db.plugin_events.find({"connection_id": conn["id"]}).sort("created_at", -1).to_list(5)
    observed = "\n".join(f"- {e['kind']} {e.get('path','')}: {e.get('summary','')}" for e in recent)

    prompt = payload.question
    if context:
        prompt = f"{context}\n\n---\n\n{payload.question}"
    if observed:
        prompt = f"Recent observations from the connected app:\n{observed}\n\n{prompt}"

    provider = get_provider()
    answer = ""
    async for delta in provider.stream(system, [{"role": "user", "content": prompt}], spec["vendor"], spec["model"]):
        answer += delta

    await _touch(conn, inc=1)
    return {
        "answer": answer,
        "model": spec["name"],
        "scopes": conn.get("scopes", []),
        "may_edit": may_edit,
        "may_run": may_run,
    }
