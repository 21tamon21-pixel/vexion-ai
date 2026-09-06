"""Criterion: Free plan allows tiers 1-3; Aether (tier 5) must be rejected
with 402 for a free-plan signed-in account, and never silently downgraded.
"""

import uuid

import httpx


def _signup(client: httpx.Client, suffix: str):
    email = f"tscheck-aethergate-{suffix}@example.com"
    resp = client.post(
        "/auth/signup",
        json={"email": email, "password": "vexion12345", "name": "TSCheck Gate"},
    )
    assert resp.status_code == 200, resp.text
    session_cookie = resp.cookies.get("vexion_session")
    if session_cookie:
        client.cookies.set("vexion_session", session_cookie)
    return resp.json()


def test_free_plan_account_gets_402_for_aether_tier5(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    _signup(client, suffix)

    convo_resp = client.post("/conversations", json={"title": f"tscheck-aether-{suffix}"})
    assert convo_resp.status_code == 200, convo_resp.text
    convo_id = convo_resp.json()["id"]

    resp = client.post(
        f"/chat/{convo_id}/stream",
        json={"content": "hello", "model_id": "aether"},
        timeout=30.0,
    )
    assert resp.status_code == 402, resp.text
    detail = resp.json().get("detail", "")
    assert "aether" in detail.lower() or "plan" in detail.lower() or "tier" in detail.lower(), detail
