import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import AuditLog, Matter, User
from app.schemas import AuditOut
from app.services.access import matter_or_404
from app.services.agent_tools import AGENTS

router = APIRouter(prefix="/audit", tags=["audit"])
LIMIT = 200


def _query(q: str | None, decision: str | None, actor: str | None, since: datetime | None):
    stmt = select(AuditLog)
    if q:
        stmt = stmt.where(AuditLog.action.ilike(f"%{q.strip().replace(' ', '_')}%"))
    if decision:
        stmt = stmt.where(AuditLog.policy_decision == decision)
    if actor == "agent":
        stmt = stmt.where(AuditLog.agent_key.is_not(None))
    elif actor == "user":
        stmt = stmt.where(AuditLog.agent_key.is_(None))
    if since:
        stmt = stmt.where(AuditLog.occurred_at >= since)
    return stmt.order_by(AuditLog.occurred_at.desc()).limit(LIMIT)


def _out(db: Session, rows: list[AuditLog]) -> list[AuditOut]:
    user_ids = {r.user_id for r in rows if r.user_id} | {r.approved_by for r in rows if r.approved_by}
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    matter_ids = {r.matter_id for r in rows if r.matter_id}
    titles = {m.id: m.title for m in db.scalars(select(Matter).where(Matter.id.in_(matter_ids))).all()} if matter_ids else {}
    return [AuditOut(
        id=r.id, occurred_at=r.occurred_at, action=r.action, user_name=names.get(r.user_id), agent_key=r.agent_key,
        agent_name=AGENTS.get(r.agent_key or ""), matter_id=r.matter_id, matter_title=titles.get(r.matter_id),
        resource_type=r.resource_type, resource_id=r.resource_id, policy_decision=r.policy_decision,
        approved=r.approved, approved_by_name=names.get(r.approved_by), executed=r.executed, result=r.result or {},
    ) for r in rows]


@router.get("", response_model=list[AuditOut], dependencies=[Depends(require_roles("admin"))])
def search(q: str | None = None, decision: str | None = None, actor: str | None = None,
           since: datetime | None = None, db: Session = Depends(get_db)):
    """Firm-wide audit trail (admins). Newest first, latest 200 matching entries."""
    return _out(db, list(db.scalars(_query(q, decision, actor, since)).all()))


@router.get("/matters/{matter_id}", response_model=list[AuditOut])
def for_matter(matter_id: uuid.UUID, q: str | None = None, decision: str | None = None, actor: str | None = None,
               since: datetime | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Audit entries for one matter, for anyone who can open it."""
    matter_or_404(db, matter_id, user)
    stmt = _query(q, decision, actor, since).where(AuditLog.matter_id == matter_id)
    return _out(db, list(db.scalars(stmt).all()))
