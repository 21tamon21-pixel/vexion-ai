"""Tavily web research — the only search provider, with hard credit protection.

Guards, in order, all server-side (a modified frontend cannot bypass them):
  1. TAVILY_API_KEY present, else 503.
  2. Cache hit on a normalised query inside TAVILY_CACHE_TTL_MIN -> no API call.
  3. Per-user daily + monthly quota for the account's effective plan.
  4. Project-wide daily + monthly ceiling protecting the owner's credits.
Only after all four does a request reach Tavily, and the counter is incremented
on the way out.
"""
from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.db import db
from lib.entitlements import (
    GLOBAL_TAVILY_DAILY,
    GLOBAL_TAVILY_MONTHLY,
    bump,
    count,
    day_key,
    limits_for,
    month_key,
    next_daily_reset,
)
from lib.security import current_user

router = APIRouter(prefix="/research", tags=["research"])

CACHE_TTL_MIN = int(os.environ.get("TAVILY_CACHE_TTL_MIN", "1440"))


class ResearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=400)
    depth: str = "basic"


class Source(BaseModel):
    title: str
    url: str
    snippet: str
    score: float = 0.0


class ResearchResult(BaseModel):
    query: str
    answer: str
    sources: List[Source]
    cached: bool
    provider: str = "tavily"
    daily_remaining: int
    monthly_remaining: int
    resets_at: str


def configured() -> bool:
    return bool(os.environ.get("TAVILY_API_KEY", "").strip())


def _norm(query: str) -> str:
    return re.sub(r"\s+", " ", query.strip().lower())


def _cache_key(query: str, depth: str) -> str:
    return hashlib.sha256(f"{_norm(query)}|{depth}".encode()).hexdigest()


@router.get("/state")
async def state(user: Dict[str, Any] = Depends(current_user)):
    lim = limits_for(user)
    d, m = day_key(), month_key()
    used_d = await count("tavily", user["id"], d)
    used_m = await count("tavily", user["id"], m)
    cached_items = await db.research_cache.count_documents({})
    return {
        "configured": configured(),
        "daily_used": used_d,
        "daily_limit": lim["tavily_daily"],
        "daily_remaining": max(0, lim["tavily_daily"] - used_d),
        "monthly_used": used_m,
        "monthly_limit": lim["tavily_monthly"],
        "monthly_remaining": max(0, lim["tavily_monthly"] - used_m),
        "project_daily_used": await count("tavily", None, d),
        "project_daily_limit": GLOBAL_TAVILY_DAILY,
        "cache_ttl_minutes": CACHE_TTL_MIN,
        "cached_items": cached_items,
        "resets_at": next_daily_reset().isoformat(),
    }


@router.post("", response_model=ResearchResult)
async def research(payload: ResearchRequest, user: Dict[str, Any] = Depends(current_user)):
    if not configured():
        raise HTTPException(
            status_code=503,
            detail="Web research is not configured — add TAVILY_API_KEY to backend/.env",
        )

    lim = limits_for(user)
    d, m = day_key(), month_key()
    resets = next_daily_reset().isoformat()

    # 2. cache first — a hit costs no credit and no quota
    key = _cache_key(payload.query, payload.depth)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=CACHE_TTL_MIN)
    hit = await db.research_cache.find_one({"key": key, "created_at": {"$gte": cutoff}})
    if hit:
        return ResearchResult(
            query=payload.query,
            answer=hit["answer"],
            sources=[Source(**s) for s in hit["sources"]],
            cached=True,
            daily_remaining=max(0, lim["tavily_daily"] - await count("tavily", user["id"], d)),
            monthly_remaining=max(0, lim["tavily_monthly"] - await count("tavily", user["id"], m)),
            resets_at=resets,
        )

    # 3. per-user quota
    used_d = await count("tavily", user["id"], d)
    if used_d >= lim["tavily_daily"]:
        raise HTTPException(
            status_code=429,
            detail=f"Daily research limit reached ({lim['tavily_daily']}). Resets at {resets}.",
        )
    used_m = await count("tavily", user["id"], m)
    if used_m >= lim["tavily_monthly"]:
        raise HTTPException(
            status_code=429, detail=f"Monthly research limit reached ({lim['tavily_monthly']})."
        )

    # 4. project-wide credit protection
    if await count("tavily", None, d) >= GLOBAL_TAVILY_DAILY:
        raise HTTPException(
            status_code=429, detail="Project-wide research limit reached for today. Try tomorrow."
        )
    if await count("tavily", None, m) >= GLOBAL_TAVILY_MONTHLY:
        raise HTTPException(
            status_code=429, detail="Project-wide research limit reached for this month."
        )

    async with httpx.AsyncClient(timeout=45) as http:
        res = await http.post(
            "https://api.tavily.com/search",
            json={
                "api_key": os.environ.get("TAVILY_API_KEY", "").strip(),
                "query": payload.query,
                "search_depth": "advanced" if payload.depth == "advanced" else "basic",
                "include_answer": True,
                "max_results": 6,
            },
        )
    if res.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"Tavily error {res.status_code}")

    body = res.json()
    sources = [
        Source(
            title=r.get("title", "")[:200],
            url=r.get("url", ""),
            snippet=(r.get("content") or "")[:400],
            score=float(r.get("score") or 0),
        )
        for r in body.get("results", [])
    ]
    answer = body.get("answer") or ""

    await bump("tavily", user["id"], d)
    await bump("tavily", user["id"], m)
    await db.research_cache.insert_one(
        {
            "id": str(uuid.uuid4()),
            "key": key,
            "query": payload.query,
            "answer": answer,
            "sources": [s.model_dump() for s in sources],
            "created_at": datetime.now(timezone.utc),
        }
    )

    return ResearchResult(
        query=payload.query,
        answer=answer,
        sources=sources,
        cached=False,
        daily_remaining=max(0, lim["tavily_daily"] - (used_d + 1)),
        monthly_remaining=max(0, lim["tavily_monthly"] - (used_m + 1)),
        resets_at=resets,
    )


@router.delete("/cache")
async def clear_cache(user: Dict[str, Any] = Depends(current_user)):
    result = await db.research_cache.delete_many({})
    return {"cleared": result.deleted_count}
