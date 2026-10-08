import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Client, Matter, MatterMember, TimelineEvent, User
from app.schemas import MatterIn, MatterOut, MatterUpdate, MemberIn, MemberOut, TimelineOut
from app.services.access import can_manage, visible_matters
from app.services.matters import add_timeline, next_matter_number

router = APIRouter(prefix="/matters", tags=["matters"])


def get_matter_or_404(db: Session, matter_id: uuid.UUID, user: User) -> Matter:
    """Matters the user may not see are reported as not found, so their existence is not leaked."""
    matter = db.scalar(select(Matter).where(Matter.id == matter_id, visible_matters(user)))
    if not matter:
        raise HTTPException(404, "Matter not found")
    return matter


def manageable_matter_or_403(db: Session, matter_id: uuid.UUID, user: User) -> Matter:
    matter = get_matter_or_404(db, matter_id, user)
    if not can_manage(db, user, matter):
        raise HTTPException(403, "Only an admin, a partner or the assigned lawyer can change who has access")
    return matter


@router.get("", response_model=list[MatterOut])
def list_matters(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(Matter).where(visible_matters(user)).order_by(Matter.created_at.desc())
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
    if matter.assigned_lawyer_id != user.id:  # the creator keeps access to what they created
        db.add(MatterMember(matter_id=matter.id, user_id=user.id, role="creator"))
    add_timeline(db, matter.id, "matter_created", "Matter created", user.id)
    db.commit()
    return matter


@router.get("/{matter_id}", response_model=MatterOut)
def get_matter(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_matter_or_404(db, matter_id, user)


@router.patch("/{matter_id}", response_model=MatterOut)
def update_matter(matter_id: uuid.UUID, body: MatterUpdate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    matter = get_matter_or_404(db, matter_id, user)
    changes = body.model_dump(exclude_unset=True)
    access_fields = {"restricted", "assigned_lawyer_id"} & {k for k, v in changes.items() if getattr(matter, k) != v}
    if access_fields and not can_manage(db, user, matter):
        raise HTTPException(403, "Only an admin, a partner or the assigned lawyer can change who has access")
    for k, v in changes.items():
        setattr(matter, k, v)
    add_timeline(db, matter.id, "matter_updated", "Matter updated", user.id, {"fields": list(changes)})
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
    manageable_matter_or_403(db, matter_id, user)
    target = db.get(User, body.user_id)
    if not target or not target.is_active:
        raise HTTPException(400, "User not found")
    if db.scalar(select(MatterMember).where(MatterMember.matter_id == matter_id, MatterMember.user_id == body.user_id)):
        raise HTTPException(409, "User is already a member")
    member = MatterMember(matter_id=matter_id, user_id=body.user_id, role=body.role)
    db.add(member)
    add_timeline(db, matter_id, "member_added", f"{target.name} added to matter", user.id)
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
