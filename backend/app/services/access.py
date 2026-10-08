"""Case (matter) access control. Server-side only; every matter-scoped route goes through here.

Rules:
- admin sees every matter (to manage the firm);
- partner sees every matter except restricted ones they are not on;
- lawyer, associate and paralegal see matters they are assigned to or are members of;
- a restricted matter is visible only to admins, its assigned lawyer and its members.
"""
import uuid

from sqlalchemy import ColumnElement, or_, select, true
from sqlalchemy.orm import Session

from app.models import Matter, MatterMember, User

MANAGE_ACCESS_ROLES = {"admin", "partner"}


def _on_matter(user: User) -> ColumnElement[bool]:
    return or_(
        Matter.assigned_lawyer_id == user.id,
        Matter.id.in_(select(MatterMember.matter_id).where(MatterMember.user_id == user.id)),
    )


def visible_matters(user: User) -> ColumnElement[bool]:
    """WHERE clause limiting a query on Matter to what `user` may see."""
    role = user.role.name
    if role == "admin":
        return true()
    if role == "partner":
        return or_(Matter.restricted.is_(False), _on_matter(user))
    return _on_matter(user)


def visible_matter_ids(user: User):
    """Subquery of matter IDs `user` may see, for filtering other matter-scoped tables."""
    return select(Matter.id).where(visible_matters(user))


def can_view(db: Session, user: User, matter_id: uuid.UUID) -> bool:
    return db.scalar(select(Matter.id).where(Matter.id == matter_id, visible_matters(user))) is not None


def can_manage(db: Session, user: User, matter: Matter) -> bool:
    """Change membership or the restricted flag: an admin/partner who can see it, or the assigned lawyer."""
    if not can_view(db, user, matter.id):
        return False
    return user.role.name in MANAGE_ACCESS_ROLES or matter.assigned_lawyer_id == user.id
