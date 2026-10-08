import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, true
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import Agent, AgentPolicy, ApprovalRequest, Firm, User
from app.schemas import (
    ActionIn, ActionResultOut, AgentControlsOut, AgentInfoOut, AgentUpdate, ApprovalOut, KillSwitchIn, OverrideIn,
    OverrideOut, PolicyIn, ToolInfoOut,
)
from app.services import agent_runtime, audit
from app.services.agent_tools import TOOLS
from app.services.policy import base_decision, kill_switch_on

router = APIRouter(prefix="/agents", tags=["agents"])
approvals_router = APIRouter(prefix="/approvals", tags=["approvals"])
admin_only = Depends(require_roles("admin"))


@router.post("/actions", response_model=ActionResultOut)
async def request_action(body: ActionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Ask for an agent action. The policy engine decides: run now, wait for approval, or block."""
    return await agent_runtime.request_action(db, user, body.agent_key, body.action, body.args)


@router.get("/controls", response_model=AgentControlsOut, dependencies=[admin_only])
def controls(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    agents = db.scalars(select(Agent).order_by(Agent.name)).all()
    keys = {a.id: a.key for a in agents}
    overrides = db.scalars(select(AgentPolicy).where(AgentPolicy.is_override.is_(True), AgentPolicy.expires_at > now)
                           .order_by(AgentPolicy.expires_at)).all()
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_({o.created_by for o in overrides}))).all()}
    return AgentControlsOut(
        kill_switch=kill_switch_on(db),
        agents=[AgentInfoOut(key=a.key, name=a.name, enabled=a.enabled, mode=a.mode) for a in agents],
        tools=[ToolInfoOut(action=t.action, label=t.label, description=t.description, is_mutation=t.is_mutation,
                           is_external=t.is_external, is_destructive=t.is_destructive,
                           decision=base_decision(db, t.action)) for t in TOOLS.values()],
        overrides=[OverrideOut(id=o.id, action=o.action, agent_key=keys.get(o.agent_id), decision=o.decision,
                               expires_at=o.expires_at, created_by_name=names.get(o.created_by)) for o in overrides],
    )


@router.put("/kill-switch", dependencies=[admin_only])
def set_kill_switch(body: KillSwitchIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    firm = db.scalar(select(Firm))
    if not firm:
        raise HTTPException(409, "Firm is not set up")
    firm.settings = {**(firm.settings or {}), "agents_kill_switch": body.on}
    audit.record(db, action="KILL_SWITCH_ON" if body.on else "KILL_SWITCH_OFF", user_id=user.id, executed=True)
    db.commit()
    return {"kill_switch": body.on}


@router.put("/policies/{action}", dependencies=[admin_only])
def set_policy(action: str, body: PolicyIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    if action not in TOOLS:
        raise HTTPException(404, "Unknown action")
    agent_runtime.set_rule(db, user, action, body.decision, body.agent_key)
    db.commit()
    return {"action": action, "decision": body.decision}


@router.post("/overrides", response_model=OverrideOut, status_code=201, dependencies=[admin_only])
def grant_override(body: OverrideIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.action not in TOOLS:
        raise HTTPException(404, "Unknown action")
    if body.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "Expiry must be in the future")
    agent = db.scalar(select(Agent).where(Agent.key == body.agent_key)) if body.agent_key else None
    if body.agent_key and not agent:
        raise HTTPException(404, "Unknown agent")
    o = AgentPolicy(action=body.action, agent_id=agent.id if agent else None, decision=body.decision, is_override=True,
                    expires_at=body.expires_at, created_by=user.id)
    db.add(o)
    db.flush()
    audit.record(db, action="OVERRIDE_GRANTED", user_id=user.id, resource_type="agent_policy", resource_id=str(o.id),
                 executed=True, result={"action": body.action, "decision": body.decision, "agent": body.agent_key,
                                        "expires_at": body.expires_at.isoformat()})
    db.commit()
    return OverrideOut(id=o.id, action=o.action, agent_key=body.agent_key, decision=o.decision, expires_at=o.expires_at,
                       created_by_name=user.name)


@router.post("/overrides/{override_id}/revoke", dependencies=[admin_only])
def revoke_override(override_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    o = db.get(AgentPolicy, override_id)
    if not o or not o.is_override:
        raise HTTPException(404, "Override not found")
    o.expires_at = datetime.now(timezone.utc)  # ended, kept for the record
    audit.record(db, action="OVERRIDE_REVOKED", user_id=user.id, resource_type="agent_policy",
                 resource_id=str(o.id), executed=True)
    db.commit()
    return {"revoked": True}


@router.put("/{agent_key}", response_model=AgentInfoOut, dependencies=[admin_only])
def update_agent(agent_key: str, body: AgentUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    agent = db.scalar(select(Agent).where(Agent.key == agent_key))
    if not agent:
        raise HTTPException(404, "Unknown agent")
    agent.enabled, agent.mode = body.enabled, body.mode
    audit.record(db, action="AGENT_UPDATED", user_id=user.id, agent_key=agent_key, executed=True,
                 result={"enabled": body.enabled, "mode": body.mode})
    db.commit()
    return AgentInfoOut(key=agent.key, name=agent.name, enabled=agent.enabled, mode=agent.mode)


def _visible(user: User):
    """Admins see every request; others see their own."""
    return true() if user.role.name == "admin" else ApprovalRequest.user_id == user.id


@approvals_router.get("", response_model=list[ApprovalOut])
def list_approvals(status: str = "pending", db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(ApprovalRequest).where(_visible(user))
    rows = list(db.scalars(q.order_by(ApprovalRequest.created_at.desc()).limit(200)).all())
    agent_runtime.expire_old(db, rows)
    db.commit()
    rows = [r for r in rows if (r.status == "pending") == (status == "pending")]
    return [agent_runtime.approval_out(db, r) for r in rows[:100]]


@approvals_router.get("/count")
def pending_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Requests waiting on this user (the sidebar badge)."""
    n = db.scalar(select(func.count()).select_from(ApprovalRequest)
                  .where(ApprovalRequest.status == "pending", ApprovalRequest.user_id == user.id)) or 0
    return {"pending": n}


@approvals_router.post("/{request_id}/approve", response_model=ApprovalOut)
async def approve(request_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return await agent_runtime.approve(db, user, request_id)


@approvals_router.post("/{request_id}/reject", response_model=ApprovalOut)
def reject(request_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return agent_runtime.reject(db, user, request_id)
