"""Criterion (bug fix): create_session's Secure flag follows the request's
real scheme instead of always being True. Over plain http (no
X-Forwarded-Proto, or an explicit http value) the Set-Cookie header for
vexion_session must NOT carry Secure — otherwise browsers drop it and every
subsequent write 401s ("could not start a chat"). Behind a proxy claiming
https, Secure must be set.
"""

import os
import uuid

import httpx

API_URL = f"{os.environ.get('BACKEND_URL', 'http://localhost:8001')}/api"


def _signup_raw(suffix: str, headers: dict | None = None) -> httpx.Response:
    email = f"tscheck-cookiesecure-{suffix}@example.com"
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        return c.post(
            "/auth/signup",
            json={"email": email, "password": "vexion12345", "name": "TSCheck Cookie"},
            headers=headers or {},
        )


def test_signup_over_plain_http_sets_non_secure_cookie():
    suffix = uuid.uuid4().hex[:10]
    resp = _signup_raw(suffix)
    assert resp.status_code == 200, resp.text
    set_cookie = resp.headers.get("set-cookie", "")
    assert "vexion_session" in set_cookie, set_cookie
    assert "Secure" not in set_cookie, (
        f"cookie must not be Secure over plain http (browsers would drop it): {set_cookie}"
    )
    assert "HttpOnly" in set_cookie


def test_signup_behind_https_forwarded_proto_sets_secure_cookie():
    suffix = uuid.uuid4().hex[:10]
    resp = _signup_raw(suffix, headers={"X-Forwarded-Proto": "https"})
    assert resp.status_code == 200, resp.text
    set_cookie = resp.headers.get("set-cookie", "")
    assert "vexion_session" in set_cookie, set_cookie
    assert "Secure" in set_cookie, f"cookie should be Secure when the proxy reports https: {set_cookie}"
