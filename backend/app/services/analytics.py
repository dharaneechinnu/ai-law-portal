"""Analytics over the matters the viewer can open. Only numbers that lead to a decision: who is overloaded, what is late,
which alerts are unreviewed, and how often AI actions are blocked or rejected."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AgentExecution, ApprovalRequest, AuditLog, Hearing, Judgment, LegalDevelopment, Matter, MatterLegalMatch, Task, User,
)
from app.services.access import visible_matter_ids, visible_matters
from app.services.agent_tools import AGENTS, TOOLS
from app.services.legal_match import alert_threshold

HIGH_IMPACT = 0.8


def _bars(rows) -> list[dict]:
    # NULL and "" both read as "Not set"; merge them so each label appears once, keeping the input order.
    merged: dict[str, int] = {}
    for k, v in rows:
        label = str(k or "Not set")
        merged[label] = merged.get(label, 0) + int(v)
    return [{"label": k, "value": v} for k, v in merged.items()]


def firm(db: Session, user: User, since: datetime) -> dict:
    now = datetime.now(timezone.utc)
    allowed = visible_matter_ids(user)
    active = [visible_matters(user), Matter.status == "active"]
    task_scope = Task.matter_id.in_(allowed)
    ages = [(now - m.created_at).days for m in db.scalars(select(Matter).where(*active)).all() if m.created_at]
    per_person = db.execute(
        select(User.name, func.count(Task.id), func.count(Task.id).filter(Task.due_at < now))
        .join(Task, Task.assignee_id == User.id)
        .where(Task.status == "open", task_scope).group_by(User.name).order_by(func.count(Task.id).desc()).limit(8)
    ).all()
    return {
        "active_matters": len(ages),
        "avg_matter_age_days": round(sum(ages) / len(ages)) if ages else 0,
        "overdue_tasks": db.scalar(select(func.count()).select_from(Task).where(
            Task.status == "open", Task.due_at < now, task_scope)) or 0,
        "hearings_next_14_days": db.scalar(select(func.count()).select_from(Hearing).where(
            Hearing.status == "scheduled", Hearing.matter_id.in_(allowed), Hearing.scheduled_at >= now,
            Hearing.scheduled_at < now + timedelta(days=14))) or 0,
        "tasks_created": db.scalar(select(func.count()).select_from(Task).where(
            task_scope, Task.created_at >= since)) or 0,
        "tasks_done": db.scalar(select(func.count()).select_from(Task).where(
            task_scope, Task.status == "done", Task.updated_at >= since)) or 0,
        "by_practice_area": _bars(db.execute(select(Matter.practice_area, func.count()).where(*active)
                                             .group_by(Matter.practice_area).order_by(func.count().desc())).all()),
        "workload": [{"label": n, "value": int(o), "overdue": int(od)} for n, o, od in per_person],
    }


def legal(db: Session, user: User, since: datetime) -> dict:
    threshold = alert_threshold(db)
    scope = [MatterLegalMatch.matter_id.in_(visible_matter_ids(user)), MatterLegalMatch.relevance >= threshold]
    by_status = dict(db.execute(select(MatterLegalMatch.status, func.count()).where(*scope)
                                .group_by(MatterLegalMatch.status)).all())
    return {
        "judgments_added": db.scalar(select(func.count()).select_from(Judgment).where(Judgment.created_at >= since)) or 0,
        "alerts_new": int(by_status.get("new", 0)),
        "alerts_reviewed": int(by_status.get("reviewed", 0)),
        "alerts_dismissed": int(by_status.get("dismissed", 0)),
        "high_impact_unreviewed": db.scalar(select(func.count()).select_from(MatterLegalMatch).where(
            *scope, MatterLegalMatch.status == "new", MatterLegalMatch.relevance >= HIGH_IMPACT)) or 0,
        "alerts_in_range": db.scalar(select(func.count()).select_from(MatterLegalMatch)
                                     .join(LegalDevelopment, LegalDevelopment.id == MatterLegalMatch.development_id)
                                     .where(*scope, LegalDevelopment.detected_at >= since)) or 0,
    }


def ai(db: Session, user: User, since: datetime) -> dict:
    """Admins see the whole firm; everyone else sees their own AI activity."""
    mine = [] if user.role.name == "admin" else [AuditLog.user_id == user.id]
    # Only tool requests count; admin changes to agent settings are also stamped with an agent key.
    agent_rows = [AuditLog.agent_key.is_not(None), AuditLog.action.in_(list(TOOLS)), AuditLog.occurred_at >= since, *mine]
    # One row per request; rows written when someone approves or rejects carry `approved` and are left out here.
    decisions = dict(db.execute(select(AuditLog.policy_decision, func.count()).where(*agent_rows, AuditLog.approved.is_(None))
                                .group_by(AuditLog.policy_decision)).all())
    appr_scope = [ApprovalRequest.created_at >= since] + ([] if user.role.name == "admin" else [ApprovalRequest.user_id == user.id])
    approvals = dict(db.execute(select(ApprovalRequest.status, func.count()).where(*appr_scope)
                                .group_by(ApprovalRequest.status)).all())
    exec_scope = [AgentExecution.created_at >= since] + ([] if user.role.name == "admin" else [AgentExecution.user_id == user.id])
    top = db.execute(select(AuditLog.action, func.count()).where(*agent_rows, AuditLog.approved.is_(None))
                     .group_by(AuditLog.action).order_by(func.count().desc()).limit(6)).all()
    by_agent = db.execute(select(AuditLog.agent_key, func.count()).where(*agent_rows, AuditLog.approved.is_(None))
                          .group_by(AuditLog.agent_key).order_by(func.count().desc())).all()
    models = db.execute(select(AgentExecution.model_used, func.count()).where(*exec_scope)
                        .group_by(AgentExecution.model_used).order_by(func.count().desc())).all()
    return {
        "allowed": int(decisions.get("ALLOWED", 0)),
        "asked": int(decisions.get("APPROVAL_REQUIRED", 0)),
        "blocked": int(decisions.get("DISABLED", 0)),
        "approved": int(approvals.get("approved", 0)),
        "rejected": int(approvals.get("rejected", 0)),
        "pending": int(approvals.get("pending", 0)),
        "conversations": db.scalar(select(func.count()).select_from(AgentExecution).where(*exec_scope)) or 0,
        "top_actions": [{"label": TOOLS[a].label if a in TOOLS else a, "value": int(n)} for a, n in top],
        "by_agent": [{"label": AGENTS.get(k, k), "value": int(n)} for k, n in by_agent],
        "models": _bars(models),
    }


def overview(db: Session, user: User, days: int) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return {"days": days, "firm": firm(db, user, since), "legal": legal(db, user, since), "ai": ai(db, user, since)}
