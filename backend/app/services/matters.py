import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Matter, TimelineEvent


def add_timeline(db: Session, matter_id: uuid.UUID, event_type: str, title: str,
                 actor_id: uuid.UUID | None = None, detail: dict | None = None) -> None:
    db.add(TimelineEvent(matter_id=matter_id, event_type=event_type, title=title, detail=detail or {},
                         actor_user_id=actor_id, occurred_at=datetime.now(timezone.utc)))


def next_matter_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count()).select_from(Matter)) or 0
    return f"M-{year}-{count + 1:04d}"
