import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Matter, User
from app.schemas import AvailabilityOut, BusyOut, DashMatter, PersonDetailOut, PersonOut
from app.services.access import visible_matters
from app.services.people import Busy, busy_slots, hours_of, is_free, on_matter, status_now, within_hours, workload

router = APIRouter(prefix="/people", tags=["people"])


def _active_or_404(db: Session, person_id: uuid.UUID) -> User:
    person = db.get(User, person_id)
    if not person or not person.is_active:
        raise HTTPException(404, "Person not found")
    return person


def _busy_out(b: Busy, viewer: User, person: User) -> BusyOut:
    # Colleagues see that someone is busy, not what their meetings are about.
    title = b.title if b.kind == "hearing" or viewer.id == person.id else "Busy"
    return BusyOut(start=b.start, end=b.end, title=title, kind=b.kind)


async def _person(db: Session, p: User, load: tuple[int, int, int]) -> dict:
    status, until = await status_now(db, p)
    return dict(id=p.id, name=p.name, email=p.email, role_name=p.role.name, designation=p.designation,
                practice_areas=p.practice_areas or [], status=status, busy_until=until,
                open_tasks=load[0], overdue_tasks=load[1], active_matters=load[2])


@router.get("", response_model=list[PersonOut])
async def list_people(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    people = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name)).all()
    loads = workload(db, [p.id for p in people])
    return [PersonOut(**await _person(db, p, loads[p.id])) for p in people]


@router.get("/{person_id}", response_model=PersonDetailOut)
async def get_person(person_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = _active_or_404(db, person_id)
    now = datetime.now(timezone.utc)
    busy = await busy_slots(db, p, now, now + timedelta(days=7))
    matters = db.scalars(select(Matter).where(Matter.status == "active", on_matter(p.id), visible_matters(user))
                         .order_by(Matter.next_hearing.asc().nulls_last()).limit(20)).all()
    return PersonDetailOut(
        **await _person(db, p, workload(db, [p.id])[p.id]), phone=p.phone, office_location=p.office_location,
        timezone=p.timezone, working_hours=hours_of(p), busy=[_busy_out(b, user, p) for b in busy],
        matters=[DashMatter(id=m.id, title=m.title, matter_number=m.matter_number, priority=m.priority,
                            next_hearing=m.next_hearing) for m in matters],
    )


@router.get("/{person_id}/availability", response_model=AvailabilityOut)
async def availability(person_id: uuid.UUID, start: datetime, end: datetime, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    """Is this person free between start and end? Working hours plus calendar and hearings."""
    if end <= start:
        raise HTTPException(400, "End must be after start")
    p = _active_or_404(db, person_id)
    busy = [b for b in await busy_slots(db, p, start, end) if b.start < end and b.end > start]
    return AvailabilityOut(free=await is_free(db, p, start, end),
                           within_hours=within_hours(p, start) and within_hours(p, end - timedelta(minutes=1)),
                           busy=[_busy_out(b, user, p) for b in busy])
