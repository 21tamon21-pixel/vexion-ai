"""Criterion: Projects work like ChatGPT projects — creating a project,
saving instructions, and a chat created "in" that project shows up in the
project's chat list.
"""

import uuid

import httpx


def _signup(client: httpx.Client, suffix: str):
    email = f"tscheck-projects-{suffix}@example.com"
    resp = client.post(
        "/auth/signup",
        json={"email": email, "password": "vexion12345", "name": "TSCheck Projects"},
    )
    assert resp.status_code == 200, resp.text
    session_cookie = resp.cookies.get("vexion_session")
    if session_cookie:
        client.cookies.set("vexion_session", session_cookie)


def test_project_create_configure_and_chat_association(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    _signup(client, suffix)

    create_resp = client.post(
        "/projects",
        json={"name": f"tscheck-project-{suffix}", "description": "tscheck project"},
    )
    assert create_resp.status_code == 200, create_resp.text
    project = create_resp.json()
    project_id = project["id"]

    update_resp = client.patch(
        f"/projects/{project_id}",
        json={"instructions": "tscheck: always answer in French"},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["instructions"] == "tscheck: always answer in French"

    convo_resp = client.post(
        "/conversations",
        params={"project_id": project_id},
    )
    assert convo_resp.status_code == 200, convo_resp.text
    convo = convo_resp.json()
    assert convo["project_id"] == project_id, convo

    list_resp = client.get(f"/projects/{project_id}/conversations")
    assert list_resp.status_code == 200, list_resp.text
    convo_ids = [c["id"] for c in list_resp.json()]
    assert convo["id"] in convo_ids, convo_ids
