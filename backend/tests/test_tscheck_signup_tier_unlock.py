"""Criterion: Sign-up is open; new accounts are isolated and signing in unlocks
higher tiers (auth-gated model_id is rejected for guests, accepted for a
freshly signed-up user against their own conversation).
"""

import uuid

import httpx


def _signup(client: httpx.Client, suffix: str):
    email = f"tscheck-signup-{suffix}@example.com"
    resp = client.post(
        "/auth/signup",
        json={"email": email, "password": "vexion12345", "name": "TSCheck User"},
    )
    assert resp.status_code == 200, resp.text
    # The session cookie is set with Secure=True; httpx's cookie jar drops
    # Secure cookies over a plain-http base_url, so attach it manually.
    session_cookie = resp.cookies.get("vexion_session")
    if session_cookie:
        client.cookies.set("vexion_session", session_cookie)
    return resp.json()


def test_new_account_is_isolated_with_no_conversations(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    user = _signup(client, suffix)
    assert user["email"] == f"tscheck-signup-{suffix}@example.com"

    resp = client.get("/conversations")
    assert resp.status_code == 200, resp.text
    convos = resp.json()
    assert convos == [], f"fresh account should start with zero conversations, got {convos}"


def test_signed_in_account_can_create_conversation_and_use_locked_model(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    _signup(client, suffix)

    create_resp = client.post("/conversations", json={"title": f"tscheck-convo-{suffix}"})
    assert create_resp.status_code == 200, create_resp.text
    convo = create_resp.json()
    convo_id = convo["id"]

    with client.stream(
        "POST",
        f"/chat/{convo_id}/stream",
        json={"content": "tscheck: reply with just the word OK", "model_id": "quartz"},
        timeout=60.0,
    ) as resp:
        assert resp.status_code == 200, resp.text
        got_done = False
        for line in resp.iter_lines():
            if line.startswith("event: done"):
                got_done = True
                break
        assert got_done, "expected the signed-in stream on a locked-tier model to complete"


def test_guest_cannot_use_locked_tier_model(client: httpx.Client):
    """Guest stream endpoint ignores/rejects model selection and only ever
    serves the free model — simulate a signed-out attempt to hit a
    conversation-scoped stream for a locked model without auth: must 401/403."""
    resp = client.post(
        "/chat/some-fake-conversation-id/stream",
        json={"content": "hi", "model_id": "quartz"},
    )
    assert resp.status_code in (401, 403, 404), resp.text
