import hmac

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional

from lib.entitlements import owner_code

from lib.db import db
from lib.security import (
    create_session,
    current_user,
    destroy_session,
    hash_password,
    optional_user,
    verify_password,
)
from models.schemas import LoginRequest, Persona, PersonaUpdate, SignupRequest, User

router = APIRouter(prefix="/auth", tags=["auth"])


def _is_https(request: Request) -> bool:
    """Honour the ingress' X-Forwarded-Proto; fall back to the direct scheme."""
    forwarded = request.headers.get("x-forwarded-proto", "")
    if forwarded:
        return forwarded.split(",")[0].strip() == "https"
    return request.url.scheme == "https"


def _public(doc: Dict[str, Any]) -> User:
    return User(**{k: v for k, v in doc.items() if k not in ("_id", "password_hash")})


@router.post("/signup", response_model=User)
async def signup(payload: SignupRequest, request: Request, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    user = User(email=email, name=payload.name, persona=Persona())
    doc = user.model_dump()
    doc["password_hash"] = hash_password(payload.password)
    await db.users.insert_one(doc)
    await create_session(response, user.id, secure=_is_https(request))
    return user


@router.post("/login", response_model=User)
async def login(payload: LoginRequest, request: Request, response: Response):
    doc = await db.users.find_one({"email": payload.email.lower()})
    if not doc or not verify_password(payload.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await create_session(response, doc["id"], secure=_is_https(request))
    return _public(doc)


@router.post("/logout")
async def logout(response: Response, vexion_session: Optional[str] = Cookie(default=None)):
    await destroy_session(response, vexion_session)
    return {"ok": True}


@router.get("/me", response_model=Optional[User])
async def me(user: Optional[Dict[str, Any]] = Depends(optional_user)):
    return _public(user) if user else None


class OwnerUnlockRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200)


@router.post("/owner-unlock", response_model=User)
async def owner_unlock(
    payload: OwnerUnlockRequest, user: Dict[str, Any] = Depends(current_user)
):
    """Validates OWNER_CODE server-side. The code is never sent to the browser,
    never returned in a response and never compared in frontend code."""
    expected = owner_code()
    if not expected:
        raise HTTPException(status_code=503, detail="Owner access is not configured")
    if not hmac.compare_digest(payload.code.strip(), expected):
        raise HTTPException(status_code=403, detail="Invalid owner code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"owner": True}})
    return _public(await db.users.find_one({"id": user["id"]}))


@router.post("/owner-lock", response_model=User)
async def owner_lock(user: Dict[str, Any] = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"owner": False}})
    return _public(await db.users.find_one({"id": user["id"]}))


@router.patch("/persona", response_model=User)
async def update_persona(payload: PersonaUpdate, user: Dict[str, Any] = Depends(current_user)):
    persona = Persona(**user.get("persona", {}))
    updates = payload.model_dump(exclude_none=True)
    persona = persona.model_copy(update=updates)
    await db.users.update_one({"id": user["id"]}, {"$set": {"persona": persona.model_dump()}})
    doc = await db.users.find_one({"id": user["id"]})
    return _public(doc)
