"""Password hashing + httpOnly cookie sessions. No tokens ever reach JS."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Cookie, Header, HTTPException, Response

from lib.db import db

SESSION_COOKIE = "vexion_session"
SESSION_DAYS = 30
_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


async def create_session(response: Response, user_id: str, secure: bool = True) -> str:
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        }
    )
    # `secure` must follow the request scheme: a Secure cookie set over plain
    # http is dropped by the browser, which used to leave the SPA "signed in"
    # with no session cookie (every write then failed with 401).
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=SESSION_DAYS * 86400,
        path="/",
    )
    return token


async def destroy_session(response: Response, token: Optional[str]) -> None:
    if token:
        await db.sessions.delete_many({"token": token})
    response.delete_cookie(SESSION_COOKIE, path="/")


async def _user_from_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    session = await db.sessions.find_one({"token": token})
    if not session:
        return None
    expires = session["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        await db.sessions.delete_many({"token": token})
        return None
    return await db.users.find_one({"id": session["user_id"]})


async def bearer_connection(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    """Auth for external plugin clients (the coding-bridge). Token, not cookie."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    conn = await db.plugin_connections.find_one({"token": token, "revoked": False})
    if not conn:
        raise HTTPException(status_code=401, detail="Invalid or revoked connection token")
    return conn


async def current_user(vexion_session: Optional[str] = Cookie(default=None)) -> Dict[str, Any]:
    user = await _user_from_token(vexion_session)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def optional_user(vexion_session: Optional[str] = Cookie(default=None)):
    return await _user_from_token(vexion_session)
