"""Criterion: PayPal is intentionally unconfigured — /billing/state exposes
paypal_configured=false and three plans, and creating an order for a paid
plan returns 503 with a clear reason (never a fake success).
"""

import uuid

import httpx


def _signup(client: httpx.Client, suffix: str):
    email = f"tscheck-paypalhonesty-{suffix}@example.com"
    resp = client.post(
        "/auth/signup",
        json={"email": email, "password": "vexion12345", "name": "TSCheck PayPal"},
    )
    assert resp.status_code == 200, resp.text
    session_cookie = resp.cookies.get("vexion_session")
    if session_cookie:
        client.cookies.set("vexion_session", session_cookie)


def test_billing_state_shows_three_plans_and_paypal_unconfigured(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    _signup(client, suffix)

    resp = client.get("/billing/state")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["plans"]) == 3, data["plans"]
    assert data["subscription"]["plan_id"] == "free", data["subscription"]
    assert data["paypal_configured"] is False, data


def test_paypal_order_for_paid_plan_returns_503_not_fake_success(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    _signup(client, suffix)

    resp = client.post("/billing/paypal/order", json={"plan_id": "pro"})
    assert resp.status_code == 503, resp.text
    assert "not configured" in resp.json().get("detail", "").lower()
