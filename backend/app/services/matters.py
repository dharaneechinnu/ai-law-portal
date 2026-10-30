import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Client, Matter, MatterMember, TimelineEvent, User
from app.schemas import ClientIn, MatterIn
from app.services.access import can_manage, matter_or_404


def add_timeline(db: Session, matter_id: uuid.UUID, event_type: str, title: str,
                 actor_id: uuid.UUID | None = None, detail: dict | None = None) -> None:
    db.add(TimelineEvent(matter_id=matter_id, event_type=event_type, title=title, detail=detail or {},
                         actor_user_id=actor_id, occurred_at=datetime.now(timezone.utc)))


def next_matter_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count()).select_from(Matter)) or 0
    return f"M-{year}-{count + 1:04d}"


def manageable_matter_or_403(db: Session, matter_id: uuid.UUID, user: User) -> Matter:
    matter = matter_or_404(db, matter_id, user)
    if not can_manage(db, user, matter):
        raise HTTPException(403, "Only an admin, a partner or the assigned lawyer can change who has access")
    return matter


def create_matter(db: Session, user: User, body: MatterIn) -> Matter:
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
    return matter


def update_matter(db: Session, user: User, matter: Matter, changes: dict) -> Matter:
    access_fields = {"restricted", "assigned_lawyer_id"} & {k for k, v in changes.items() if getattr(matter, k) != v}
    if access_fields and not can_manage(db, user, matter):
        raise HTTPException(403, "Only an admin, a partner or the assigned lawyer can change who has access")
    for k, v in changes.items():
        setattr(matter, k, v)
    add_timeline(db, matter.id, "matter_updated", "Matter updated", user.id, {"fields": list(changes)})
    return matter


def add_member(db: Session, user: User, matter_id: uuid.UUID, user_id: uuid.UUID, role: str) -> tuple[MatterMember, User]:
    manageable_matter_or_403(db, matter_id, user)
    target = db.get(User, user_id)
    if not target or not target.is_active:
        raise HTTPException(400, "User not found")
    if db.scalar(select(MatterMember).where(MatterMember.matter_id == matter_id, MatterMember.user_id == user_id)):
        raise HTTPException(409, "User is already a member")
    member = MatterMember(matter_id=matter_id, user_id=user_id, role=role)
    db.add(member)
    db.flush()
    add_timeline(db, matter_id, "member_added", f"{target.name} added to matter", user.id)
    return member, target


def create_client(db: Session, user: User, body: ClientIn) -> Client:
    client = Client(firm_id=user.firm_id, **body.model_dump())
    db.add(client)
    db.flush()
    return client


def update_client(db: Session, client_id: uuid.UUID, changes: dict) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    for k, v in changes.items():
        setattr(client, k, v)
    return client
