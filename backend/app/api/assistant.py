from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Agent, User
from app.schemas import AgentInfoOut, ChatIn, ChatOut
from app.services import agents

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/agents", response_model=list[AgentInfoOut])
def available_agents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Agent).where(Agent.enabled.is_(True), Agent.key.in_(agents.AGENT_SPECS))).all()
    return [AgentInfoOut(key=a.key, name=a.name, enabled=a.enabled, mode=a.mode) for a in rows]


@router.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """One turn with an agent. Runs server-side; every action it asks for goes through the policy engine."""
    return await agents.chat(db, user, body.agent_key, body.message, body.execution_id)
