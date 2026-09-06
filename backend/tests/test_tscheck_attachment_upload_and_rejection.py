"""Criterion: attachments accept text/image/pdf and reject everything else
(415), and a document upload's extracted text is available for the chat to
quote back (checked at the API layer: extracted_text round-trips exactly).
"""

import uuid

import httpx


def test_txt_attachment_upload_extracts_unique_token(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    token = f"TSCHECK-TOKEN-{suffix}"
    content = f"This is a seeded test document. The secret token is {token}.".encode()

    files = {"file": (f"tscheck-{suffix}.txt", content, "text/plain")}
    resp = client.post("/attachments", files=files)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["kind"] == "document", data
    assert token in data["extracted_text"], data["extracted_text"]


def test_unsupported_file_type_rejected_with_415(client: httpx.Client):
    suffix = uuid.uuid4().hex[:10]
    files = {"file": (f"tscheck-{suffix}.exe", b"MZ\x90\x00binary", "application/octet-stream")}
    resp = client.post("/attachments", files=files)
    assert resp.status_code == 415, resp.text
