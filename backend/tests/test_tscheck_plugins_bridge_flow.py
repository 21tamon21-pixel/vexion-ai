"""Criterion: Code Bridge plugin connect flow + the outward Code Bridge API.

Creating a connection returns a one-time vxb_ token. That token authenticates
GET /bridge/handshake, POST /bridge/observe and POST /bridge/ask; an invalid
token is rejected with 401; after revoke, the token is rejected with 401 too.
"""

import uuid

import httpx


def _signup(client: httpx.Client, suffix: str):
    email = f"tscheck-bridge-{suffix}@example.com"
    resp = client.post(
        "/auth/signup",
        json={"email": email, "password": "vexion12345", "name": "TSCheck Bridge"},
    )
    assert resp.status_code == 200, resp.text
    session_cookie = resp.cookies.get("vexion_session")
    if session_cookie:
        client.cookies.set("vexion_session", session_cookie)


def test_code_bridge_connect_then_handshake_observe_ask_then_revoke(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    _signup(client, suffix)

    create_resp = client.post(
        "/plugins/connections",
        json={
            "plugin_id": "code_bridge",
            "label": f"tscheck-bridge-conn-{suffix}",
            "repo_url": "",
            "branch": "main",
            "site_url": "",
            "notes": "",
            "scopes": ["observe", "connect"],
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    body = create_resp.json()
    token = body["token"]
    connection_id = body["connection"]["id"]
    assert token.startswith("vxb_"), token
    assert "/api/bridge" in body["handshake_prompt"], body["handshake_prompt"]

    auth_header = {"Authorization": f"Bearer {token}"}

    handshake_resp = client.get("/bridge/handshake", headers=auth_header)
    assert handshake_resp.status_code == 200, handshake_resp.text
    assert handshake_resp.json()["connection"]["id"] == connection_id

    observe_resp = client.post(
        "/bridge/observe",
        headers=auth_header,
        json={"kind": "note", "path": "tscheck.py", "summary": "tscheck observation", "content": "print(1)"},
    )
    assert observe_resp.status_code == 200, observe_resp.text
    assert observe_resp.json()["ok"] is True

    ask_resp = client.post(
        "/bridge/ask",
        headers=auth_header,
        json={"question": "tscheck: reply with just the word OK", "files": []},
        timeout=60.0,
    )
    assert ask_resp.status_code == 200, ask_resp.text
    assert "answer" in ask_resp.json(), ask_resp.text

    bad_resp = client.get("/bridge/handshake", headers={"Authorization": "Bearer vxb_invalidtoken"})
    assert bad_resp.status_code == 401, bad_resp.text

    revoke_resp = client.post(f"/plugins/connections/{connection_id}/revoke")
    assert revoke_resp.status_code == 200, revoke_resp.text
    assert revoke_resp.json()["revoked"] is True

    after_revoke_resp = client.get("/bridge/handshake", headers=auth_header)
    assert after_revoke_resp.status_code == 401, after_revoke_resp.text
