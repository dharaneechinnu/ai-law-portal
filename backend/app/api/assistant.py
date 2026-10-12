import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Agent, User
from app.schemas import AgentInfoOut, ChatIn, ChatOut, ResumeIn, UploadOut
from app.services import agents
from app.services.documents import stage_upload

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/agents", response_model=list[AgentInfoOut])
def available_agents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Agent).where(Agent.enabled.is_(True), Agent.key.in_(agents.AGENT_SPECS))).all()
    rows = sorted(rows, key=lambda a: (a.key != "assistant", a.name))  # Ask AI first
    return [AgentInfoOut(key=a.key, name=a.name, enabled=a.enabled, mode=a.mode) for a in rows]


@router.post("/uploads", response_model=UploadOut, status_code=201)
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Attach a file to the chat. It is private to you until an approved action files it into a matter."""
    return stage_upload(db, user, file.filename, file.content_type, await file.read())


@router.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """One turn with an agent. Runs server-side; every action it asks for goes through the policy engine."""
    return await agents.chat(db, user, body.agent_key, body.message, body.execution_id,
                             upload_ids=body.upload_ids, matter_id=body.matter_id)


@router.post("/chat/{execution_id}/resume", response_model=ChatOut)
async def resume(execution_id: uuid.UUID, body: ResumeIn, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Continue after the waiting actions are approved or rejected."""
    return await agents.resume(db, user, body.agent_key, execution_id)
