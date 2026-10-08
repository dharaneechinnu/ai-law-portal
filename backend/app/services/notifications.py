"""In-app notifications. Every notification has a link to act on and a dedupe key so a reminder is never sent twice."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CalendarEvent, Hearing, Matter, MatterMember, Notification, Task, User
from app.services import firm_settings

log = logging.getLogger(__name__)

# Notification kind -> the Account page preference that controls it (None = always on).
PREF_FOR = {
    "briefing": "briefing", "hearing": "reminders", "meeting": "reminders", "deadline": "reminders",
    "overdue": "reminders", "legal": "legal_alerts", "approval": "approvals", "task": None,
}


def notify(db: Session, user_id: uuid.UUID, kind: str, title: str, *, body: str | None = None,
           link: str | None = None, dedupe_key: str | None = None) -> bool:
    """Queue one notification (caller commits). Skipped if the user turned this kind off or already has it."""
    user = db.get(User, user_id)
    if not user or not user.is_active:
        return False
    pref = PREF_FOR.get(kind)
    if pref and (user.notification_prefs or {}).get(pref) is False:
        return False
    if dedupe_key and db.scalar(select(Notification.id).where(Notification.user_id == user_id,
                                                              Notification.dedupe_key == dedupe_key)):
        return False
    db.add(Notification(user_id=user_id, kind=kind, title=title[:300], body=body, link=link, dedupe_key=dedupe_key,
                        created_at=datetime.now(timezone.utc)))
    db.flush()
    return True


def matter_team(db: Session, matter_id: uuid.UUID) -> set[uuid.UUID]:
    matter = db.get(Matter, matter_id)
    ids = set(db.scalars(select(MatterMember.user_id).where(MatterMember.matter_id == matter_id)).all())
    if matter and matter.assigned_lawyer_id:
        ids.add(matter.assigned_lawyer_id)
    return ids


def _when(at: datetime, user: User | None) -> str:
    from zoneinfo import ZoneInfo
    local = at.astimezone(ZoneInfo(user.timezone)) if user else at
    return local.strftime("%d %b, %I:%M %p").replace(" 0", " ")


def send_reminders(db: Session, now: datetime | None = None) -> int:
    """Upcoming hearings, meetings and due tasks (lead times are firm settings), and newly overdue tasks."""
    now = now or datetime.now(timezone.utc)
    hearing_ahead = timedelta(hours=firm_settings.get(db, "hearing_reminder_hours"))
    meeting_ahead = timedelta(minutes=firm_settings.get(db, "meeting_reminder_minutes"))
    due_ahead = timedelta(hours=firm_settings.get(db, "task_due_reminder_hours"))
    sent = 0
    for h in db.scalars(select(Hearing).where(Hearing.status == "scheduled", Hearing.scheduled_at > now,
                                              Hearing.scheduled_at <= now + hearing_ahead)).all():
        matter = db.get(Matter, h.matter_id)
        for uid in matter_team(db, h.matter_id):
            sent += notify(db, uid, "hearing", f"Hearing: {matter.title}", body=f"{h.purpose or 'Hearing'} · {_when(h.scheduled_at, db.get(User, uid))}",
                           link=f"/matters/{h.matter_id}", dedupe_key=f"hearing:{h.id}:{h.scheduled_at.isoformat()}")
    for e in db.scalars(select(CalendarEvent).where(CalendarEvent.status != "cancelled", CalendarEvent.starts_at > now,
                                                    CalendarEvent.starts_at <= now + meeting_ahead)).all():
        for uid in {e.owner_id, *(uuid.UUID(a) for a in (e.attendee_ids or []))}:
            sent += notify(db, uid, "meeting", f"Starting soon: {e.title}", body=_when(e.starts_at, db.get(User, uid)),
                           link="/calendar", dedupe_key=f"event:{e.id}:{e.starts_at.isoformat()}")
    for t in db.scalars(select(Task).where(Task.status == "open", Task.assignee_id.is_not(None), Task.due_at.is_not(None),
                                           Task.due_at <= now + due_ahead)).all():
        link = f"/matters/{t.matter_id}" if t.matter_id else "/tasks"
        if t.due_at > now:
            sent += notify(db, t.assignee_id, "deadline", f"Due soon: {t.title}", body=_when(t.due_at, db.get(User, t.assignee_id)),
                           link=link, dedupe_key=f"task:{t.id}:{t.due_at.isoformat()}:due")
        else:
            sent += notify(db, t.assignee_id, "overdue", f"Overdue: {t.title}", link=link,
                           dedupe_key=f"task:{t.id}:{t.due_at.isoformat()}:overdue")
    db.commit()
    return sent
