"""Append-only audit trail of user and agent actions. Rows are never updated or deleted."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(db: Session, *, action: str, user_id: uuid.UUID | None = None, agent_key: str | None = None,
           resource_type: str | None = None, resource_id: str | None = None, matter_id: uuid.UUID | None = None,
           policy_decision: str | None = None, approved: bool | None = None, approved_by: uuid.UUID | None = None,
           executed: bool | None = None, result: dict | None = None, provider: str | None = None) -> None:
    db.add(AuditLog(
        occurred_at=datetime.now(timezone.utc), user_id=user_id, agent_key=agent_key, action=action,
        resource_type=resource_type, resource_id=resource_id, matter_id=matter_id, policy_decision=policy_decision,
        approved=approved, approved_by=approved_by, executed=executed, result=result or {}, provider=provider,
    ))
