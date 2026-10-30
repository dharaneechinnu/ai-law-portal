"""Calendar events (through CalendarProvider) and court hearings."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CalendarEvent, Hearing, Matter, User
from app.providers.base import CalendarProvider
from app.providers.local_calendar import LocalCalendarProvider
from app.schemas import CalItemOut, EventIn, HearingIn, HearingOut
from app.services.access import matter_or_404, visible_matter_ids
from app.services.matters import add_timeline
from app.services.notifications import notify

HEARING_LENGTH = timedelta(hours=1)  # display length only; hearings store a start time


def get_calendar_provider(db: Session) -> CalendarProvider:
    """Only the local provider exists today; Google/Outlook will be chosen from Settings later."""
    return LocalCalendarProvider(db)


def is_attendee(event: CalendarEvent, user_id: uuid.UUID) -> bool:
    return event.owner_id == user_id or str(user_id) in (event.attendee_ids or [])


def check_people(db: Session, ids: list[uuid.UUID]) -> list[str]:
    ids = list(dict.fromkeys(ids))
    found = db.scalars(select(User.id).where(User.id.in_(ids), User.is_active.is_(True))).all() if ids else []
    if len(found) != len(ids):
        raise HTTPException(400, "Person not found")
    return [str(i) for i in ids]


def check_times(start: datetime, end: datetime) -> None:
    if end <= start:
        raise HTTPException(400, "End must be after start")


def own_event_or_404(db: Session, event_id: uuid.UUID, user: User) -> CalendarEvent:
    event = db.get(CalendarEvent, event_id)
    if not event or not is_attendee(event, user.id):
        raise HTTPException(404, "Event not found")
    if event.owner_id != user.id:
        raise HTTPException(403, "Only the organiser can change this event")
    return event


def refresh_next_hearing(db: Session, matter_id: uuid.UUID) -> None:
    """Keep Matter.next_hearing equal to the earliest upcoming scheduled hearing."""
    db.flush()  # sessions don't autoflush; the query below must see the hearing change just made
    matter = db.get(Matter, matter_id)
    if matter:
        matter.next_hearing = db.scalar(
            select(Hearing.scheduled_at).where(Hearing.matter_id == matter_id, Hearing.status == "scheduled",
                                               Hearing.scheduled_at >= datetime.now(timezone.utc))
            .order_by(Hearing.scheduled_at).limit(1)
        )


async def create_event(db: Session, user: User, body: EventIn) -> CalItemOut:
    check_times(body.start, body.end)
    if body.matter_id:
        matter_or_404(db, body.matter_id, user)
    attendees = [a for a in check_people(db, body.attendee_ids) if a != str(user.id)]
    event_id = await get_calendar_provider(db).create_event(
        str(user.id), body.title, body.start, body.end, location=body.location, matter_id=body.matter_id,
        attendee_ids=attendees)
    for uid in attendees:
        notify(db, uuid.UUID(uid), "meeting", f"Invited: {body.title}", body=f"From {user.name}", link="/calendar",
               dedupe_key=f"event:{event_id}:invite:{uid}")
    return next(i for i in items_between(db, user, body.start, body.end) if str(i.id) == event_id)


async def update_event(db: Session, user: User, event: CalendarEvent, data: dict) -> CalItemOut:
    """Apply a partial update from the organiser: move, rename, re-invite or cancel."""
    if data.get("status") == "cancelled":
        await get_calendar_provider(db).cancel_event(str(event.id))
    elif "status" in data:
        event.status = data["status"]
    if data.get("matter_id"):
        matter_or_404(db, data["matter_id"], user)
    if "attendee_ids" in data:
        before = set(event.attendee_ids or [])
        event.attendee_ids = [a for a in check_people(db, data["attendee_ids"] or []) if a != str(user.id)]
        for uid in set(event.attendee_ids) - before:
            notify(db, uuid.UUID(uid), "meeting", f"Invited: {event.title}", body=f"From {user.name}",
                   link="/calendar", dedupe_key=f"event:{event.id}:invite:{uid}")
    for field, col in (("title", "title"), ("start", "starts_at"), ("end", "ends_at"), ("location", "location"),
                       ("matter_id", "matter_id")):
        if field in data:
            setattr(event, col, data[field])
    check_times(event.starts_at, event.ends_at)
    db.flush()
    return next(i for i in items_between(db, user, event.starts_at, event.ends_at) if i.id == event.id)


def hearing_out(db: Session, h: Hearing) -> HearingOut:
    matter = db.get(Matter, h.matter_id)
    return HearingOut.model_validate(h).model_copy(update={"matter_title": matter.title if matter else None})


def hearing_or_404(db: Session, hearing_id: uuid.UUID, user: User) -> Hearing:
    h = db.scalar(select(Hearing).where(Hearing.id == hearing_id, Hearing.matter_id.in_(visible_matter_ids(user))))
    if not h:
        raise HTTPException(404, "Hearing not found")
    return h


def create_hearing(db: Session, user: User, body: HearingIn) -> Hearing:
    matter = matter_or_404(db, body.matter_id, user)
    h = Hearing(**body.model_dump())
    db.add(h)
    db.flush()
    add_timeline(db, matter.id, "hearing_scheduled", f"Hearing on {h.scheduled_at:%d %b %Y}", user.id,
                 {"hearing_id": str(h.id)})
    refresh_next_hearing(db, matter.id)
    return h


def update_hearing(db: Session, user: User, h: Hearing, data: dict) -> Hearing:
    old_status, old_at = h.status, h.scheduled_at
    for k, v in data.items():
        setattr(h, k, v)
    if h.status != old_status:
        add_timeline(db, h.matter_id, f"hearing_{h.status}", f"Hearing {h.status}", user.id, {"hearing_id": str(h.id)})
    elif h.scheduled_at != old_at:
        add_timeline(db, h.matter_id, "hearing_moved", f"Hearing moved to {h.scheduled_at:%d %b %Y}", user.id,
                     {"hearing_id": str(h.id)})
    refresh_next_hearing(db, h.matter_id)
    return h


def items_between(db: Session, user: User, start: datetime, end: datetime) -> list[CalItemOut]:
    events = [e for e in db.scalars(select(CalendarEvent).where(
        CalendarEvent.starts_at < end, CalendarEvent.ends_at > start)).all() if is_attendee(e, user.id)]
    hearings = db.scalars(select(Hearing).where(
        Hearing.matter_id.in_(visible_matter_ids(user)), Hearing.scheduled_at >= start - HEARING_LENGTH,
        Hearing.scheduled_at < end)).all()
    matter_ids = {e.matter_id for e in events if e.matter_id} | {h.matter_id for h in hearings}
    titles = {m.id: m.title for m in db.scalars(select(Matter).where(Matter.id.in_(matter_ids))).all()} if matter_ids else {}
    items = [
        CalItemOut(kind="event", id=e.id, title=e.title, start=e.starts_at, end=e.ends_at, location=e.location,
                   matter_id=e.matter_id, matter_title=titles.get(e.matter_id), status=e.status, owner_id=e.owner_id,
                   attendee_ids=[uuid.UUID(a) for a in (e.attendee_ids or [])])
        for e in events
    ] + [
        CalItemOut(kind="hearing", id=h.id, title=h.purpose or "Hearing", start=h.scheduled_at,
                   end=h.scheduled_at + HEARING_LENGTH, location=h.court_room, matter_id=h.matter_id,
                   matter_title=titles.get(h.matter_id), status=h.status, outcome=h.outcome)
        for h in hearings
    ]
    return sorted(items, key=lambda i: i.start)
