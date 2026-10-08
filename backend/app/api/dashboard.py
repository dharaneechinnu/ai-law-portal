from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Hearing, Judgment, LegalDevelopment, Matter, MatterLegalMatch, Task, User
from app.schemas import DashAlert, DashboardOut, DashItem, DashMatter, DashStats
from app.services.access import visible_matter_ids, visible_matters
from app.services.legal_match import alert_threshold

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _day_bounds(tz_name: str) -> tuple[datetime, datetime]:
    now = datetime.now(ZoneInfo(tz_name))
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


@router.get("", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """What needs attention today, for the signed-in user. Counts and lists come straight from the database."""
    day_start, day_end = _day_bounds(user.timezone)
    week_end = day_start + timedelta(days=7)
    allowed = visible_matter_ids(user)
    mine = Task.assignee_id == user.id
    open_task = Task.status == "open"
    task_visible = or_(Task.matter_id.is_(None), Task.matter_id.in_(allowed))
    titles = {m.id: m.title for m in db.scalars(select(Matter).where(visible_matters(user))).all()}

    due_today = db.scalars(select(Task).where(mine, open_task, task_visible, Task.due_at >= day_start, Task.due_at < day_end)
                           .order_by(Task.due_at).limit(20)).all()
    overdue = db.scalars(select(Task).where(mine, open_task, task_visible, Task.due_at < day_start)
                         .order_by(Task.due_at).limit(20)).all()
    hearings = db.scalars(select(Hearing).where(Hearing.status == "scheduled", Hearing.matter_id.in_(allowed),
                                                Hearing.scheduled_at >= day_start,
                                                Hearing.scheduled_at < day_end).order_by(Hearing.scheduled_at)).all()

    def task_item(t: Task) -> DashItem:
        return DashItem(kind="task", id=t.id, title=t.title, at=t.due_at, matter_id=t.matter_id,
                        matter_title=titles.get(t.matter_id), priority=t.priority)

    today = sorted(
        [DashItem(kind="hearing", id=h.id, title=h.purpose or "Hearing", at=h.scheduled_at, matter_id=h.matter_id,
                  matter_title=titles.get(h.matter_id)) for h in hearings] + [task_item(t) for t in due_today],
        key=lambda i: i.at or day_end,
    )

    threshold = alert_threshold(db)
    alert_rows = db.execute(
        select(MatterLegalMatch, Matter, Judgment)
        .join(Matter, Matter.id == MatterLegalMatch.matter_id)
        .join(LegalDevelopment, LegalDevelopment.id == MatterLegalMatch.development_id)
        .join(Judgment, Judgment.id == LegalDevelopment.judgment_id)
        .where(MatterLegalMatch.relevance >= threshold, MatterLegalMatch.status == "new",
               MatterLegalMatch.matter_id.in_(allowed))
        .order_by(MatterLegalMatch.relevance.desc()).limit(5)
    ).all()
    new_alerts = db.scalar(select(func.count()).select_from(MatterLegalMatch)
                           .where(MatterLegalMatch.relevance >= threshold, MatterLegalMatch.status == "new",
                                  MatterLegalMatch.matter_id.in_(allowed))) or 0

    open_matters = db.scalar(select(func.count()).select_from(Matter).where(Matter.status == "active", visible_matters(user))) or 0
    recent = db.scalars(select(Matter).where(Matter.status == "active", visible_matters(user))
                        .order_by(Matter.next_hearing.asc().nulls_last(), Matter.created_at.desc()).limit(6)).all()
    hearings_week = db.scalar(select(func.count()).select_from(Hearing).where(
        Hearing.status == "scheduled", Hearing.matter_id.in_(allowed), Hearing.scheduled_at >= day_start,
        Hearing.scheduled_at < week_end)) or 0

    return DashboardOut(
        stats=DashStats(open_matters=open_matters, overdue_tasks=len(overdue), hearings_week=hearings_week,
                        new_alerts=new_alerts),
        today=today,
        overdue=[task_item(t) for t in overdue],
        alerts=[DashAlert(id=mm.id, matter_id=m.id, matter_title=m.title, title=j.title, relevance=mm.relevance)
                for mm, m, j in alert_rows],
        matters=[DashMatter(id=m.id, title=m.title, matter_number=m.matter_number, priority=m.priority,
                            next_hearing=m.next_hearing) for m in recent],
    )
