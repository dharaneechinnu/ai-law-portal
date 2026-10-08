"""People: workload and availability. `is_free` is the service agents call to ask "is X free?"."""
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Hearing, Matter, MatterMember, Task, User
from app.services.calendar import HEARING_LENGTH, get_calendar_provider

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DEFAULT_HOURS = {d: (["09:00", "18:00"] if i < 5 else None) for i, d in enumerate(DAYS)}


@dataclass
class Busy:
    start: datetime
    end: datetime
    title: str
    kind: str  # event / hearing
    event_id: str | None = None


def hours_of(user: User) -> dict:
    """Saved working hours, falling back to Mon–Fri 09:00–18:00 when none are set."""
    return user.working_hours if user.working_hours else DEFAULT_HOURS


def within_hours(user: User, at: datetime) -> bool:
    local = at.astimezone(ZoneInfo(user.timezone))
    span = hours_of(user).get(DAYS[local.weekday()])
    if not span:
        return False
    return span[0] <= local.strftime("%H:%M") < span[1]


def on_matter(user_id: uuid.UUID):
    return or_(Matter.assigned_lawyer_id == user_id,
               Matter.id.in_(select(MatterMember.matter_id).where(MatterMember.user_id == user_id)))


async def busy_slots(db: Session, user: User, start: datetime, end: datetime) -> list[Busy]:
    """Calendar bookings (through CalendarProvider) plus hearings on matters the person is assigned to."""
    slots = await get_calendar_provider(db).free_busy(str(user.id), start, end)
    out = [Busy(s.start, s.end, s.meta.get("title", "Busy"), "event", s.meta.get("event_id")) for s in slots]
    hearings = db.scalars(select(Hearing).join(Matter, Matter.id == Hearing.matter_id).where(
        Hearing.status == "scheduled", Matter.assigned_lawyer_id == user.id,
        Hearing.scheduled_at < end, Hearing.scheduled_at > start - HEARING_LENGTH)).all()
    out += [Busy(h.scheduled_at, h.scheduled_at + HEARING_LENGTH, "Hearing", "hearing") for h in hearings]
    return sorted(out, key=lambda b: b.start)


async def is_free(db: Session, user: User, start: datetime, end: datetime) -> bool:
    """Free means: inside working hours for the whole slot and nothing booked over it."""
    if not (within_hours(user, start) and within_hours(user, end - timedelta(minutes=1))):
        return False
    return not any(b.start < end and b.end > start for b in await busy_slots(db, user, start, end))


async def status_now(db: Session, user: User) -> tuple[str, datetime | None]:
    now = datetime.now(timezone.utc)
    if not within_hours(user, now):
        return "off", None
    current = [b for b in await busy_slots(db, user, now - timedelta(hours=12), now + timedelta(hours=12))
               if b.start <= now < b.end]
    return ("busy", max(b.end for b in current)) if current else ("free", None)


def workload(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, int, int]]:
    """(open tasks, overdue tasks, active matters) per user."""
    now = datetime.now(timezone.utc)
    open_t = dict(db.execute(select(Task.assignee_id, func.count()).where(
        Task.assignee_id.in_(user_ids), Task.status == "open").group_by(Task.assignee_id)).all())
    overdue = dict(db.execute(select(Task.assignee_id, func.count()).where(
        Task.assignee_id.in_(user_ids), Task.status == "open", Task.due_at < now).group_by(Task.assignee_id)).all())
    out = {}
    for uid in user_ids:
        matters = db.scalar(select(func.count()).select_from(Matter).where(Matter.status == "active", on_matter(uid))) or 0
        out[uid] = (open_t.get(uid, 0), overdue.get(uid, 0), matters)
    return out
