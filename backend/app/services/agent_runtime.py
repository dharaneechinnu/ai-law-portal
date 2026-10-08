"""Single entry point for every agent action: validate -> policy -> execute / ask for approval / block -> audit."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, AgentPolicy, AgentTool, ApprovalRequest, User
from app.schemas import ActionResultOut, ApprovalOut
from app.services import audit
from app.services.agent_tools import AGENTS, TOOLS
from app.services.notifications import notify
from app.services.policy import ALLOWED, APPROVAL, DISABLED, decide

log = logging.getLogger(__name__)
APPROVAL_TTL = timedelta(days=7)


def ensure_registry(db: Session) -> None:
    """Keep the agents/agent_tools tables in step with the code. New agents start in Ask-first mode."""
    for key, name in AGENTS.items():
        if not db.scalar(select(Agent).where(Agent.key == key)):
            db.add(Agent(key=key, name=name, enabled=True, mode="approval"))
    for t in TOOLS.values():
        row = db.scalar(select(AgentTool).where(AgentTool.action == t.action))
        if not row:
            row = AgentTool(action=t.action)
            db.add(row)
        row.description, row.is_mutation, row.is_external, row.is_destructive = (
            t.description, t.is_mutation, t.is_external, t.is_destructive)
    db.commit()


def _matter_id(args: dict | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(args["matter_id"])) if args and args.get("matter_id") else None
    except ValueError:
        return None


def _validate(action: str, args: dict):
    tool = TOOLS[action]
    try:
        return tool, tool.args.model_validate(args or {})
    except ValidationError as e:
        raise HTTPException(422, f"Invalid arguments for {tool.label}: {e.errors()[0]['msg']}")


async def _execute(db: Session, user: User, action: str, parsed) -> dict:
    return await TOOLS[action].run(db, user, parsed)


async def request_action(db: Session, user: User, agent_key: str | None, action: str, args: dict,
                         execution_id: uuid.UUID | None = None) -> ActionResultOut:
    if action not in TOOLS:
        audit.record(db, action=action, user_id=user.id, agent_key=agent_key, policy_decision=DISABLED,
                     executed=False, result={"reason": "Unknown action"})
        db.commit()
        return ActionResultOut(status="blocked", decision=DISABLED, reason="Unknown action")
    tool, parsed = _validate(action, args)
    if tool.precheck:
        try:
            tool.precheck(db, user, parsed)
        except HTTPException as e:
            audit.record(db, action=action, user_id=user.id, agent_key=agent_key, policy_decision=DISABLED,
                         executed=False, result={"reason": str(e.detail)})
            db.commit()
            return ActionResultOut(status="blocked", decision=DISABLED, reason=str(e.detail))
    d = decide(db, user, agent_key, action, args)
    matter_id = _matter_id(args)

    if d.decision == DISABLED:
        audit.record(db, action=action, user_id=user.id, agent_key=agent_key, matter_id=matter_id,
                     policy_decision=DISABLED, executed=False, result={"reason": d.reason})
        db.commit()
        return ActionResultOut(status="blocked", decision=DISABLED, reason=d.reason)

    if d.decision == APPROVAL:
        req = ApprovalRequest(execution_id=execution_id, user_id=user.id, action=action, status="pending",
                              payload={"args": parsed.model_dump(mode="json"), "agent_key": agent_key,
                                       "summary": tool.summary(db, parsed)})
        db.add(req)
        db.flush()
        notify(db, user.id, "approval", f"Approve: {req.payload['summary']}", body=d.reason, link="/approvals",
               dedupe_key=f"approval:{req.id}")
        audit.record(db, action=action, user_id=user.id, agent_key=agent_key, matter_id=matter_id,
                     resource_type="approval_request", resource_id=str(req.id), policy_decision=APPROVAL,
                     executed=False, result={"reason": d.reason})
        db.commit()
        return ActionResultOut(status="pending_approval", decision=APPROVAL, reason=d.reason, approval_id=req.id)

    try:
        result = await _execute(db, user, action, parsed)
    except HTTPException as e:
        db.rollback()
        audit.record(db, action=action, user_id=user.id, agent_key=agent_key, matter_id=matter_id,
                     policy_decision=ALLOWED, executed=False, result={"error": e.detail})
        db.commit()
        return ActionResultOut(status="failed", decision=ALLOWED, reason=str(e.detail))
    audit.record(db, action=action, user_id=user.id, agent_key=agent_key, matter_id=matter_id,
                 policy_decision=ALLOWED, executed=True, result=result)
    db.commit()
    return ActionResultOut(status="executed", decision=ALLOWED, reason=d.reason, result=result)


def _pending_or_404(db: Session, request_id: uuid.UUID, actor: User) -> ApprovalRequest:
    req = db.get(ApprovalRequest, request_id)
    if not req or (req.user_id != actor.id and actor.role.name != "admin"):
        raise HTTPException(404, "Approval request not found")
    expire_old(db, [req])
    if req.status != "pending":
        raise HTTPException(409, f"This request is already {req.status}")
    return req


async def approve(db: Session, actor: User, request_id: uuid.UUID) -> ApprovalOut:
    """Re-check the policy (kill switch, access, rules may have changed), then run as the requesting user."""
    req = _pending_or_404(db, request_id, actor)
    requester = db.get(User, req.user_id)
    agent_key = req.payload.get("agent_key")
    args = req.payload.get("args", {})
    d = decide(db, requester, agent_key, req.action, args)
    now = datetime.now(timezone.utc)
    if d.decision == DISABLED:
        req.status, req.decided_by, req.decided_at = "rejected", actor.id, now
        req.payload = {**req.payload, "result": {"error": f"Blocked when approved: {d.reason}"}}
        audit.record(db, action=req.action, user_id=requester.id, agent_key=agent_key, resource_type="approval_request",
                     resource_id=str(req.id), policy_decision=DISABLED, approved=True, approved_by=actor.id,
                     executed=False, result={"reason": d.reason})
        db.commit()
        return approval_out(db, req)
    _, parsed = _validate(req.action, args)
    try:
        result, executed = await _execute(db, requester, req.action, parsed), True
    except HTTPException as e:
        db.rollback()
        req = db.get(ApprovalRequest, request_id)
        result, executed = {"error": str(e.detail)}, False
    req.status, req.decided_by, req.decided_at = "approved", actor.id, now
    req.payload = {**req.payload, "result": result}
    audit.record(db, action=req.action, user_id=requester.id, agent_key=agent_key, resource_type="approval_request",
                 resource_id=str(req.id), matter_id=_matter_id(args), policy_decision=d.decision, approved=True,
                 approved_by=actor.id, executed=executed, result=result)
    db.commit()
    return approval_out(db, req)


def reject(db: Session, actor: User, request_id: uuid.UUID) -> ApprovalOut:
    req = _pending_or_404(db, request_id, actor)
    req.status, req.decided_by, req.decided_at = "rejected", actor.id, datetime.now(timezone.utc)
    audit.record(db, action=req.action, user_id=req.user_id, agent_key=req.payload.get("agent_key"),
                 resource_type="approval_request", resource_id=str(req.id), approved=False, approved_by=actor.id,
                 executed=False)
    db.commit()
    return approval_out(db, req)


def expire_old(db: Session, reqs: list[ApprovalRequest]) -> None:
    cutoff = datetime.now(timezone.utc) - APPROVAL_TTL
    for r in reqs:
        if r.status == "pending" and r.created_at and r.created_at < cutoff:
            r.status = "expired"
    db.flush()


def approval_out(db: Session, r: ApprovalRequest) -> ApprovalOut:
    tool = TOOLS.get(r.action)
    requester = db.get(User, r.user_id)
    decider = db.get(User, r.decided_by) if r.decided_by else None
    return ApprovalOut(
        id=r.id, action=r.action, label=tool.label if tool else r.action, agent_key=r.payload.get("agent_key"),
        agent_name=AGENTS.get(r.payload.get("agent_key") or ""),
        summary=r.payload.get("summary", r.action), payload=r.payload.get("args", {}), status=r.status,
        requested_for=requester.name if requester else "", decided_by_name=decider.name if decider else None,
        decided_at=r.decided_at, result=r.payload.get("result"), created_at=r.created_at,
    )


def set_rule(db: Session, actor: User, action: str, decision: str, agent_key: str | None = None) -> None:
    agent = db.scalar(select(Agent).where(Agent.key == agent_key)) if agent_key else None
    q = select(AgentPolicy).where(AgentPolicy.action == action, AgentPolicy.is_override.is_(False))
    q = q.where(AgentPolicy.agent_id == agent.id) if agent else q.where(AgentPolicy.agent_id.is_(None))
    rule = db.scalar(q)
    old = rule.decision if rule else TOOLS[action].default
    if not rule:
        rule = AgentPolicy(action=action, agent_id=agent.id if agent else None)
        db.add(rule)
    rule.decision, rule.created_by = decision, actor.id
    audit.record(db, action="POLICY_CHANGED", user_id=actor.id, resource_type="agent_policy", resource_id=action,
                 executed=True, result={"from": old, "to": decision, "agent": agent_key})
