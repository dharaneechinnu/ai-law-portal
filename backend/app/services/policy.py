"""Policy engine. The server alone decides whether an agent action is ALLOWED, APPROVAL_REQUIRED or DISABLED.
The LLM can ask for an action; it never decides permission.

Order of checks (first match wins):
1. unknown action                         -> DISABLED
2. kill switch on and the action changes data or leaves the portal -> DISABLED
3. agent missing or switched off          -> DISABLED
4. the user's role may not do this        -> DISABLED
5. the user cannot open the matter        -> DISABLED
6. active temporary override              -> its decision (an admin's explicit grant)
7. stored rule (agent-specific, then all agents), else the tool's default
8. for changes: Suggest or Ask-first mode (the stricter of agent mode and the user's preference) -> APPROVAL_REQUIRED
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Agent, AgentPolicy, Firm, User
from app.services.access import can_view
from app.services.agent_tools import TOOLS

ALLOWED, APPROVAL, DISABLED = "ALLOWED", "APPROVAL_REQUIRED", "DISABLED"
DECISIONS = {ALLOWED, APPROVAL, DISABLED}
STRICTNESS = {"suggest": 0, "approval": 1, "autonomous": 2}  # lower is stricter


@dataclass
class Decision:
    decision: str
    reason: str


def kill_switch_on(db: Session) -> bool:
    firm = db.scalar(select(Firm))
    return bool(firm and (firm.settings or {}).get("agents_kill_switch"))


def active_override(db: Session, action: str, agent: Agent | None) -> AgentPolicy | None:
    now = datetime.now(timezone.utc)
    agent_match = or_(AgentPolicy.agent_id.is_(None), AgentPolicy.agent_id == agent.id) if agent \
        else AgentPolicy.agent_id.is_(None)
    return db.scalar(select(AgentPolicy).where(
        AgentPolicy.action == action, AgentPolicy.is_override.is_(True), AgentPolicy.expires_at > now, agent_match,
    ).order_by(AgentPolicy.created_at.desc()).limit(1))


def stored_rule(db: Session, action: str, agent: Agent | None) -> AgentPolicy | None:
    base = select(AgentPolicy).where(AgentPolicy.action == action, AgentPolicy.is_override.is_(False))
    if agent:
        rule = db.scalar(base.where(AgentPolicy.agent_id == agent.id))
        if rule:
            return rule
    return db.scalar(base.where(AgentPolicy.agent_id.is_(None)))


def base_decision(db: Session, action: str, agent: Agent | None = None) -> str:
    rule = stored_rule(db, action, agent)
    return rule.decision if rule else TOOLS[action].default


def decide(db: Session, user: User, agent_key: str | None, action: str, args: dict | None = None) -> Decision:
    tool = TOOLS.get(action)
    if not tool:
        return Decision(DISABLED, "Unknown action")
    if kill_switch_on(db) and (tool.is_mutation or tool.is_external):
        return Decision(DISABLED, "The AI kill switch is on")
    agent = None
    if agent_key:
        agent = db.scalar(select(Agent).where(Agent.key == agent_key))
        if not agent or not agent.enabled:
            return Decision(DISABLED, "This agent is switched off")
    if tool.roles and user.role.name not in tool.roles:
        return Decision(DISABLED, "Your role cannot do this")
    matter_id = (args or {}).get("matter_id")
    if matter_id:
        try:
            if not can_view(db, user, uuid.UUID(str(matter_id))):
                return Decision(DISABLED, "You cannot open this matter")
        except ValueError:
            return Decision(DISABLED, "Unknown matter")

    override = active_override(db, action, agent)
    if override:
        return Decision(override.decision, f"Temporary override until {override.expires_at:%d %b %H:%M} UTC")

    decision = base_decision(db, action, agent)
    if decision == DISABLED:
        return Decision(DISABLED, "Turned off by your firm's AI rules")
    if tool.is_mutation:
        user_mode = (user.ai_prefs or {}).get("execution_mode", "approval")
        mode = min(agent.mode if agent else "approval", user_mode, key=lambda m: STRICTNESS.get(m, 0))
        if mode == "suggest":
            return Decision(APPROVAL, "Suggest mode: you decide")
        if mode == "approval" or decision == APPROVAL:
            return Decision(APPROVAL, "Needs your approval")
    return Decision(decision, "Allowed by your firm's AI rules")
