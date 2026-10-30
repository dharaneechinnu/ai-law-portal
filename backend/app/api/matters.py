import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Matter, MatterMember, TimelineEvent, User
from app.schemas import MatterIn, MatterOut, MatterUpdate, MemberIn, MemberOut, TimelineOut
from app.services import matters as matters_svc
from app.services.access import visible_matters
from app.services.matters import add_timeline, manageable_matter_or_403

router = APIRouter(prefix="/matters", tags=["matters"])


def get_matter_or_404(db: Session, matter_id: uuid.UUID, user: User) -> Matter:
    """Matters the user may not see are reported as not found, so their existence is not leaked."""
    matter = db.scalar(select(Matter).where(Matter.id == matter_id, visible_matters(user)))
    if not matter:
        raise HTTPException(404, "Matter not found")
    return matter


@router.get("", response_model=list[MatterOut])
def list_matters(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(Matter).where(visible_matters(user)).order_by(Matter.created_at.desc())
    if status:
        q = q.where(Matter.status == status)
    return db.scalars(q).all()


@router.post("", response_model=MatterOut, status_code=201)
def create_matter(body: MatterIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = matters_svc.create_matter(db, user, body)
    db.commit()
    return matter


@router.get("/{matter_id}", response_model=MatterOut)
def get_matter(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_matter_or_404(db, matter_id, user)


@router.patch("/{matter_id}", response_model=MatterOut)
def update_matter(matter_id: uuid.UUID, body: MatterUpdate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    matter = get_matter_or_404(db, matter_id, user)
    matters_svc.update_matter(db, user, matter, body.model_dump(exclude_unset=True))
    db.commit()
    return matter


@router.get("/{matter_id}/timeline", response_model=list[TimelineOut])
def timeline(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id, user)
    return db.scalars(
        select(TimelineEvent).where(TimelineEvent.matter_id == matter_id).order_by(TimelineEvent.occurred_at.desc())
    ).all()


def member_out(m: MatterMember, u: User) -> MemberOut:
    return MemberOut(id=m.id, user_id=u.id, name=u.name, email=u.email, role=m.role)


@router.get("/{matter_id}/members", response_model=list[MemberOut])
def list_members(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id, user)
    rows = db.execute(
        select(MatterMember, User).join(User, User.id == MatterMember.user_id).where(MatterMember.matter_id == matter_id)
    ).all()
    return [member_out(m, u) for m, u in rows]


@router.post("/{matter_id}/members", response_model=MemberOut, status_code=201)
def add_member(matter_id: uuid.UUID, body: MemberIn, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    member, target = matters_svc.add_member(db, user, matter_id, body.user_id, body.role)
    db.commit()
    return member_out(member, target)


@router.delete("/{matter_id}/members/{member_id}", status_code=204)
def remove_member(matter_id: uuid.UUID, member_id: uuid.UUID, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    manageable_matter_or_403(db, matter_id, user)
    member = db.get(MatterMember, member_id)
    if not member or member.matter_id != matter_id:
        raise HTTPException(404, "Member not found")
    target = db.get(User, member.user_id)
    db.delete(member)
    add_timeline(db, matter_id, "member_removed", f"{target.name} removed from matter", user.id)
    db.commit()
