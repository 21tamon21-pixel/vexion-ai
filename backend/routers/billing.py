"""Subscriptions billed through PayPal.

The PayPal credentials are NOT configured yet — the operator will add
`PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` (and optionally `PAYPAL_ENV=live`) to
backend/.env. Until then every payment call returns 503 with a clear reason and
the UI shows "PayPal not configured". Nothing about payment status is faked.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.db import db
from lib.plans import PLANS, get_plan
from lib.security import current_user
from models.schemas import PlanInfo, Subscription

router = APIRouter(prefix="/billing", tags=["billing"])

LIVE = "https://api-m.paypal.com"
SANDBOX = "https://api-m.sandbox.paypal.com"


def _creds() -> tuple[str, str, str]:
    client = os.environ.get("PAYPAL_CLIENT_ID", "").strip()
    secret = os.environ.get("PAYPAL_SECRET", "").strip()
    base = LIVE if os.environ.get("PAYPAL_ENV", "sandbox").lower() == "live" else SANDBOX
    return client, secret, base


def paypal_configured() -> bool:
    client, secret, _ = _creds()
    return bool(client and secret)


class OrderRequest(BaseModel):
    plan_id: str = Field(min_length=1)


class CaptureRequest(BaseModel):
    order_id: str = Field(min_length=1)
    plan_id: str = Field(min_length=1)


class BillingState(BaseModel):
    plans: List[PlanInfo]
    subscription: Subscription
    paypal_configured: bool
    paypal_env: str
    paypal_client_id: str  # public by design; the secret never leaves the server


async def _token(client: str, secret: str, base: str) -> str:
    async with httpx.AsyncClient(timeout=20) as http:
        res = await http.post(
            f"{base}/v1/oauth2/token",
            auth=(client, secret),
            data={"grant_type": "client_credentials"},
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="PayPal rejected the configured credentials")
    return res.json()["access_token"]


def _sub_of(user: Dict[str, Any]) -> Subscription:
    return Subscription(**(user.get("subscription") or {}))


@router.get("/state", response_model=BillingState)
async def state(user: Dict[str, Any] = Depends(current_user)):
    client, _, base = _creds()
    return BillingState(
        plans=[PlanInfo(**p) for p in PLANS],
        subscription=_sub_of(user),
        paypal_configured=paypal_configured(),
        paypal_env="live" if base == LIVE else "sandbox",
        paypal_client_id=client,
    )


@router.post("/paypal/order")
async def create_order(payload: OrderRequest, user: Dict[str, Any] = Depends(current_user)):
    plan = get_plan(payload.plan_id)
    if plan["id"] == "free":
        raise HTTPException(status_code=400, detail="The Free plan needs no payment")
    if not paypal_configured():
        raise HTTPException(
            status_code=503,
            detail="PayPal is not configured yet — add PAYPAL_CLIENT_ID and PAYPAL_SECRET to backend/.env",
        )
    client, secret, base = _creds()
    token = await _token(client, secret, base)
    async with httpx.AsyncClient(timeout=25) as http:
        res = await http.post(
            f"{base}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [
                    {
                        "reference_id": f"{user['id']}:{plan['id']}",
                        "description": f"VEXION {plan['name']} — 1 {plan['interval']}",
                        "amount": {"currency_code": "USD", "value": f"{plan['price_usd']:.2f}"},
                    }
                ],
            },
        )
    if res.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"PayPal order failed: {res.text[:200]}")
    return res.json()


@router.post("/paypal/capture", response_model=Subscription)
async def capture_order(payload: CaptureRequest, user: Dict[str, Any] = Depends(current_user)):
    if not paypal_configured():
        raise HTTPException(status_code=503, detail="PayPal is not configured yet")
    client, secret, base = _creds()
    token = await _token(client, secret, base)
    async with httpx.AsyncClient(timeout=25) as http:
        res = await http.post(
            f"{base}/v2/checkout/orders/{payload.order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    if res.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"PayPal capture failed: {res.text[:200]}")
    body = res.json()
    if body.get("status") != "COMPLETED":
        raise HTTPException(status_code=402, detail=f"Payment not completed ({body.get('status')})")

    plan = get_plan(payload.plan_id)
    sub = Subscription(
        plan_id=plan["id"],
        status="active",
        provider="paypal",
        external_id=payload.order_id,
        updated_at=datetime.now(timezone.utc),
    )
    await db.users.update_one({"id": user["id"]}, {"$set": {"subscription": sub.model_dump()}})
    return sub


@router.post("/cancel", response_model=Subscription)
async def cancel(user: Dict[str, Any] = Depends(current_user)):
    """Drops the account back to Free locally. PayPal-side recurring billing is
    not wired up (one-off orders only), so nothing is cancelled at PayPal."""
    sub = Subscription(plan_id="free", status="active", provider="none")
    await db.users.update_one({"id": user["id"]}, {"$set": {"subscription": sub.model_dump()}})
    return sub
