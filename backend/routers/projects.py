"""Projects: a named workspace with shared instructions for its chats."""
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.security import current_user
from models.schemas import Conversation, Project, ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in doc.items() if k != "_id"}


async def _owned(project_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.projects.find_one({"id": project_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


@router.get("", response_model=List[Project])
async def list_projects(user: Dict[str, Any] = Depends(current_user)):
    docs = await db.projects.find({"user_id": user["id"]}).sort("updated_at", -1).to_list(200)
    return [Project(**_clean(d)) for d in docs]


@router.post("", response_model=Project)
async def create_project(payload: ProjectCreate, user: Dict[str, Any] = Depends(current_user)):
    project = Project(user_id=user["id"], **payload.model_dump())
    await db.projects.insert_one(project.model_dump())
    return project


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str, user: Dict[str, Any] = Depends(current_user)):
    return Project(**_clean(await _owned(project_id, user)))


@router.patch("/{project_id}", response_model=Project)
async def update_project(
    project_id: str, payload: ProjectUpdate, user: Dict[str, Any] = Depends(current_user)
):
    await _owned(project_id, user)
    updates = payload.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return Project(**_clean(await db.projects.find_one({"id": project_id})))


@router.delete("/{project_id}")
async def delete_project(project_id: str, user: Dict[str, Any] = Depends(current_user)):
    await _owned(project_id, user)
    # Chats survive a deleted project — they just return to the general list.
    await db.conversations.update_many(
        {"project_id": project_id, "user_id": user["id"]}, {"$set": {"project_id": None}}
    )
    await db.projects.delete_one({"id": project_id})
    return {"ok": True}


@router.get("/{project_id}/conversations", response_model=List[Conversation])
async def project_conversations(project_id: str, user: Dict[str, Any] = Depends(current_user)):
    await _owned(project_id, user)
    docs = (
        await db.conversations.find({"project_id": project_id, "user_id": user["id"]})
        .sort([("pinned", -1), ("updated_at", -1)])
        .to_list(500)
    )
    return [Conversation(**_clean(d)) for d in docs]
