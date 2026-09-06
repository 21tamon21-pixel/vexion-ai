"""Plugin connections owned by the operator (cookie auth).

The outward-facing half — what an external app calls with the token — lives in
routers/bridge.py.
"""
from __future__ import annotations

import secrets
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from lib.db import db
from lib.plugins_catalog import CATALOG, SCOPES, get_plugin, handshake_prompt
from lib.security import current_user
from models.schemas import PluginConnection, PluginConnectionCreate, PluginConnectionWithToken

router = APIRouter(prefix="/plugins", tags=["plugins"])


class PluginCatalog(BaseModel):
    plugins: List[Dict[str, Any]]
    scopes: List[Dict[str, str]]


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in doc.items() if k not in ("_id", "token")}


def _base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return f"{proto}://{host}"


@router.get("/catalog", response_model=PluginCatalog)
async def catalog():
    return PluginCatalog(plugins=CATALOG, scopes=SCOPES)


@router.get("/connections", response_model=List[PluginConnection])
async def list_connections(user: Dict[str, Any] = Depends(current_user)):
    docs = (
        await db.plugin_connections.find({"user_id": user["id"]})
        .sort("created_at", -1)
        .to_list(200)
    )
    return [PluginConnection(**_clean(d)) for d in docs]


@router.post("/connections", response_model=PluginConnectionWithToken)
async def create_connection(
    payload: PluginConnectionCreate,
    request: Request,
    user: Dict[str, Any] = Depends(current_user),
):
    plugin = get_plugin(payload.plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail="Unknown plugin")
    if not plugin["available"]:
        raise HTTPException(
            status_code=409, detail=f"{plugin['name']} is not available yet — nothing to connect"
        )

    allowed = set(plugin["scopes"])
    scopes = [s for s in payload.scopes if s in allowed] or ["observe"]

    conn = PluginConnection(user_id=user["id"], **{**payload.model_dump(), "scopes": scopes})
    token = f"vxb_{secrets.token_urlsafe(32)}"
    doc = conn.model_dump()
    doc["token"] = token
    await db.plugin_connections.insert_one(doc)

    return PluginConnectionWithToken(
        connection=conn,
        token=token,
        handshake_prompt=handshake_prompt(
            _base_url(request), conn.label, conn.repo_url, conn.scopes
        ),
    )


@router.post("/connections/{connection_id}/revoke", response_model=PluginConnection)
async def revoke(connection_id: str, user: Dict[str, Any] = Depends(current_user)):
    doc = await db.plugin_connections.find_one({"id": connection_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.plugin_connections.update_one({"id": connection_id}, {"$set": {"revoked": True}})
    doc["revoked"] = True
    return PluginConnection(**_clean(doc))


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str, user: Dict[str, Any] = Depends(current_user)):
    doc = await db.plugin_connections.find_one({"id": connection_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.plugin_events.delete_many({"connection_id": connection_id})
    await db.plugin_connections.delete_one({"id": connection_id})
    return {"ok": True}


@router.get("/connections/{connection_id}/events")
async def connection_events(connection_id: str, user: Dict[str, Any] = Depends(current_user)):
    doc = await db.plugin_connections.find_one({"id": connection_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")
    events = (
        await db.plugin_events.find({"connection_id": connection_id})
        .sort("created_at", -1)
        .to_list(100)
    )
    return [
        {
            "id": e["id"],
            "kind": e["kind"],
            "path": e.get("path", ""),
            "summary": e.get("summary", ""),
            "created_at": str(e["created_at"]),
        }
        for e in events
    ]
