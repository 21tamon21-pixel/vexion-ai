"""Criterion: Image generation via /image returns a base64 data URL.

This call is a real network call to a live image model and can take up to
60s (per briefing seed facts).
"""

import httpx


def test_image_generate_returns_base64_data_url(client: httpx.Client):
    resp = client.post(
        "/images/generate",
        json={"prompt": "tscheck: a red lighthouse at dusk, simple flat illustration"},
        timeout=90.0,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    image_field = data.get("image_url") or data.get("data_url") or data.get("url") or data.get("image")
    assert image_field, f"expected an image field in response, got keys={list(data.keys())}"
    assert image_field.startswith("data:"), image_field[:60]
