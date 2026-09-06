"""Attachment uploads: images (multimodal input) and documents (text extraction).

Storage is the Mongo document itself — no object store is configured, and that
is stated in PROJECT_CONTEXT.md rather than pretended otherwise.
"""
from __future__ import annotations

import base64
import io
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from lib.db import db
from lib.security import optional_user
from models.schemas import Attachment

router = APIRouter(prefix="/attachments", tags=["attachments"])

MAX_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "application/json"}
PDF_TYPE = "application/pdf"


def _extract_pdf(raw: bytes) -> tuple[str, int]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    pages = len(reader.pages)
    chunks: List[str] = []
    for page in reader.pages[:40]:
        chunks.append(page.extract_text() or "")
    return "\n\n".join(chunks).strip(), pages


@router.post("", response_model=Attachment)
async def upload(
    file: UploadFile = File(...),
    user: Dict[str, Any] | None = Depends(optional_user),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 8 MB")

    mime = (file.content_type or "").lower()
    name = file.filename or "upload"

    if mime in IMAGE_TYPES:
        attachment = Attachment(
            user_id=user["id"] if user else None,
            kind="image",
            filename=name,
            mime_type=mime,
            size=len(raw),
            data_url=f"data:{mime};base64,{base64.b64encode(raw).decode()}",
        )
    elif mime == PDF_TYPE:
        try:
            text, pages = _extract_pdf(raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read that PDF: {exc}") from exc
        attachment = Attachment(
            user_id=user["id"] if user else None,
            kind="document",
            filename=name,
            mime_type=mime,
            size=len(raw),
            extracted_text=text[:200_000],
            pages=pages,
        )
    elif mime in TEXT_TYPES or name.lower().endswith((".txt", ".md", ".csv", ".json")):
        attachment = Attachment(
            user_id=user["id"] if user else None,
            kind="document",
            filename=name,
            mime_type=mime or "text/plain",
            size=len(raw),
            extracted_text=raw.decode("utf-8", errors="replace")[:200_000],
        )
    else:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Images, PDFs and plain-text documents are accepted.",
        )

    await db.attachments.insert_one(attachment.model_dump())
    return attachment


@router.get("/{attachment_id}", response_model=Attachment)
async def get_attachment(
    attachment_id: str, user: Dict[str, Any] | None = Depends(optional_user)
):
    doc = await db.attachments.find_one({"id": attachment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Attachment not found")
    owner = doc.get("user_id")
    if owner and (not user or user["id"] != owner):
        raise HTTPException(status_code=403, detail="Not your attachment")
    return Attachment(**{k: v for k, v in doc.items() if k != "_id"})
