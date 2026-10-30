import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import Hearing, User
from app.schemas import CalItemOut, EventIn, EventUpdate, HearingIn, HearingOut, HearingUpdate
from app.services.calendar import (
    check_times, create_event as create_event_svc, create_hearing as create_hearing_svc, hearing_or_404, hearing_out,
    items_between, own_event_or_404, update_event as update_event_svc, update_hearing as update_hearing_svc,
)

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
    item = await create_event_svc(db, user, body)
    db.commit()
    return item


@router.patch("/events/{event_id}", response_model=CalItemOut)
async def update_event(event_id: uuid.UUID, body: EventUpdate, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    item = await update_event_svc(db, user, own_event_or_404(db, event_id, user), body.model_dump(exclude_unset=True))
    db.commit()
    return item


@hearings_router.get("", response_model=list[HearingOut])
def list_hearings(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = get_matter_or_404(db, matter_id, user)
    rows = db.scalars(select(Hearing).where(Hearing.matter_id == matter_id).order_by(Hearing.scheduled_at.desc())).all()
    return [HearingOut.model_validate(h).model_copy(update={"matter_title": matter.title}) for h in rows]


@hearings_router.post("", response_model=HearingOut, status_code=201)
def create_hearing(body: HearingIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    h = create_hearing_svc(db, user, body)
    db.commit()
    return hearing_out(db, h)


@hearings_router.patch("/{hearing_id}", response_model=HearingOut)
def update_hearing(hearing_id: uuid.UUID, body: HearingUpdate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    h = update_hearing_svc(db, user, hearing_or_404(db, hearing_id, user), body.model_dump(exclude_unset=True))
    db.commit()
    return hearing_out(db, h)
