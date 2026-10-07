import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Client, Matter, TimelineEvent, User
from app.schemas import MatterIn, MatterOut, MatterUpdate, TimelineOut
from app.services.matters import add_timeline, next_matter_number

router = APIRouter(prefix="/matters", tags=["matters"])


def get_matter_or_404(db: Session, matter_id: uuid.UUID) -> Matter:
    matter = db.get(Matter, matter_id)
    if not matter:
        raise HTTPException(404, "Matter not found")
    return matter


@router.get("", response_model=list[MatterOut])
def list_matters(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(Matter).order_by(Matter.created_at.desc())
    if status:
        q = q.where(Matter.status == status)
    return db.scalars(q).all()


@router.post("", response_model=MatterOut, status_code=201)
def create_matter(body: MatterIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(Client, body.client_id):
        raise HTTPException(400, "Client not found")
    matter = Matter(firm_id=user.firm_id, matter_number=next_matter_number(db),
                    **body.model_dump(), important_dates=[])
    if not matter.assigned_lawyer_id:
        matter.assigned_lawyer_id = user.id
    db.add(matter)
    db.flush()
    add_timeline(db, matter.id, "matter_created", "Matter created", user.id)
    db.commit()
    return matter


@router.get("/{matter_id}", response_model=MatterOut)
def get_matter(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_matter_or_404(db, matter_id)


@router.patch("/{matter_id}", response_model=MatterOut)
def update_matter(matter_id: uuid.UUID, body: MatterUpdate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    matter = get_matter_or_404(db, matter_id)
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(matter, k, v)
    add_timeline(db, matter.id, "matter_updated", "Matter updated", user.id, {"fields": list(changes)})
    db.commit()
    return matter


@router.get("/{matter_id}/timeline", response_model=list[TimelineOut])
def timeline(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id)
    return db.scalars(
        select(TimelineEvent).where(TimelineEvent.matter_id == matter_id).order_by(TimelineEvent.occurred_at.desc())
    ).all()
