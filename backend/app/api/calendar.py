import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import CalendarEvent, Hearing, Matter, User
from app.schemas import CalItemOut, EventIn, EventUpdate, HearingIn, HearingOut, HearingUpdate
from app.services.access import visible_matter_ids
from app.services.calendar import (
    check_people, check_times, get_calendar_provider, items_between, own_event_or_404, refresh_next_hearing,
)
from app.services.matters import add_timeline
from app.services.notifications import notify

router = APIRouter(prefix="/calendar", tags=["calendar"])
hearings_router = APIRouter(prefix="/hearings", tags=["hearings"])


@router.get("", response_model=list[CalItemOut])
def calendar(start: datetime, end: datetime, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """My events (owned or invited) and hearings on matters I can open, between start and end."""
    check_times(start, end)
    if (end - start).days > 62:
        raise HTTPException(400, "Range is limited to about two months")
    return items_between(db, user, start, end)


@router.post("/events", response_model=CalItemOut, status_code=201)
async def create_event(body: EventIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_times(body.start, body.end)
    if body.matter_id:
        get_matter_or_404(db, body.matter_id, user)
    attendees = [a for a in check_people(db, body.attendee_ids) if a != str(user.id)]
    event_id = await get_calendar_provider(db).create_event(
        str(user.id), body.title, body.start, body.end, location=body.location, matter_id=body.matter_id,
        attendee_ids=attendees)
    for uid in attendees:
        notify(db, uuid.UUID(uid), "meeting", f"Invited: {body.title}", body=f"From {user.name}", link="/calendar",
               dedupe_key=f"event:{event_id}:invite:{uid}")
    db.commit()
    return next(i for i in items_between(db, user, body.start, body.end) if str(i.id) == event_id)


@router.patch("/events/{event_id}", response_model=CalItemOut)
async def update_event(event_id: uuid.UUID, body: EventUpdate, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    event = own_event_or_404(db, event_id, user)
    data = body.model_dump(exclude_unset=True)
    if data.get("status") == "cancelled":
        await get_calendar_provider(db).cancel_event(str(event.id))
    elif "status" in data:
        event.status = data["status"]
    if data.get("matter_id"):
        get_matter_or_404(db, data["matter_id"], user)
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
    db.commit()
    return next(i for i in items_between(db, user, event.starts_at, event.ends_at) if i.id == event.id)


def _hearing_out(h: Hearing, title: str | None) -> HearingOut:
    return HearingOut.model_validate(h).model_copy(update={"matter_title": title})


def _hearing_or_404(db: Session, hearing_id: uuid.UUID, user: User) -> Hearing:
    h = db.scalar(select(Hearing).where(Hearing.id == hearing_id, Hearing.matter_id.in_(visible_matter_ids(user))))
    if not h:
        raise HTTPException(404, "Hearing not found")
    return h


@hearings_router.get("", response_model=list[HearingOut])
def list_hearings(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = get_matter_or_404(db, matter_id, user)
    rows = db.scalars(select(Hearing).where(Hearing.matter_id == matter_id).order_by(Hearing.scheduled_at.desc())).all()
    return [_hearing_out(h, matter.title) for h in rows]


@hearings_router.post("", response_model=HearingOut, status_code=201)
def create_hearing(body: HearingIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = get_matter_or_404(db, body.matter_id, user)
    h = Hearing(**body.model_dump())
    db.add(h)
    db.flush()
    add_timeline(db, matter.id, "hearing_scheduled", f"Hearing on {h.scheduled_at:%d %b %Y}", user.id,
                 {"hearing_id": str(h.id)})
    refresh_next_hearing(db, matter.id)
    db.commit()
    return _hearing_out(h, matter.title)


@hearings_router.patch("/{hearing_id}", response_model=HearingOut)
def update_hearing(hearing_id: uuid.UUID, body: HearingUpdate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    h = _hearing_or_404(db, hearing_id, user)
    data = body.model_dump(exclude_unset=True)
    old_status, old_at = h.status, h.scheduled_at
    for k, v in data.items():
        setattr(h, k, v)
    if h.status != old_status:
        add_timeline(db, h.matter_id, f"hearing_{h.status}", f"Hearing {h.status}", user.id, {"hearing_id": str(h.id)})
    elif h.scheduled_at != old_at:
        add_timeline(db, h.matter_id, "hearing_moved", f"Hearing moved to {h.scheduled_at:%d %b %Y}", user.id,
                     {"hearing_id": str(h.id)})
    refresh_next_hearing(db, h.matter_id)
    db.commit()
    return _hearing_out(h, db.get(Matter, h.matter_id).title)
