"""User access management: first-run firm setup, invites, and admin user administration."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Firm, Role, User

ROLES = ["admin", "partner", "lawyer", "associate", "paralegal"]
INVITE_TTL = timedelta(days=7)
MIN_PASSWORD = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise HTTPException(422, f"Password must be at least {MIN_PASSWORD} characters")


def ensure_roles(db: Session) -> None:
    for r in ROLES:
        if not db.scalar(select(Role).where(Role.name == r)):
            db.add(Role(name=r))
    db.flush()


def get_role(db: Session, name: str) -> Role:
    role = db.scalar(select(Role).where(Role.name == name))
    if not role:
        raise HTTPException(422, f"Unknown role: {name}")
    return role


def needs_setup(db: Session) -> bool:
    return not db.scalar(select(func.count()).select_from(User))


def status_of(u: User) -> str:
    if u.invite_token_hash and not u.is_active:
        return "invited"
    return "active" if u.is_active else "disabled"


def setup_firm(db: Session, firm_name: str, name: str, email: str, password: str) -> User:
    """First-run only: create the firm and its first admin. Refused once any user exists."""
    if not needs_setup(db):
        raise HTTPException(409, "This portal is already set up. Ask your firm admin for access.")
    check_password(password)
    ensure_roles(db)
    firm = db.scalar(select(Firm)) or Firm(name=firm_name, settings={})
    firm.name = firm_name
    db.add(firm)
    db.flush()
    user = User(firm_id=firm.id, role_id=get_role(db, "admin").id, name=name, email=email.lower(),
                password_hash=hash_password(password), is_active=True)
    db.add(user)
    db.commit()
    return user


def issue_invite(user: User) -> str:
    token = secrets.token_urlsafe(32)
    user.invite_token_hash = _hash_token(token)
    user.invite_expires_at = _now() + INVITE_TTL
    return token


def user_by_invite(db: Session, token: str) -> User:
    user = db.scalar(select(User).where(User.invite_token_hash == _hash_token(token)))
    if not user or not user.invite_expires_at or user.invite_expires_at < _now():
        raise HTTPException(404, "This invite link is invalid or has expired. Ask your admin for a new one.")
    return user


def accept_invite(db: Session, token: str, password: str, name: str | None) -> User:
    user = user_by_invite(db, token)
    check_password(password)
    user.password_hash = hash_password(password)
    if name:
        user.name = name
    user.is_active = True
    user.invite_token_hash = None
    user.invite_expires_at = None
    db.commit()
    return user


def create_user(db: Session, admin: User, *, name: str, email: str, role: str, designation: str | None,
                password: str | None) -> tuple[User, str | None]:
    """Create a firm user. Without a password the account stays inactive until the invite is accepted."""
    email = email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "A user with this email already exists")
    user = User(firm_id=admin.firm_id, role_id=get_role(db, role).id, name=name, email=email,
                designation=designation, practice_areas=[], working_hours={}, notification_prefs={}, ai_prefs={})
    token = None
    if password:
        check_password(password)
        user.password_hash = hash_password(password)
        user.is_active = True
    else:
        # Unusable random hash until the invite is accepted.
        user.password_hash = hash_password(secrets.token_urlsafe(32))
        user.is_active = False
        token = issue_invite(user)
    db.add(user)
    db.commit()
    return user, token


def _active_admins(db: Session) -> int:
    return db.scalar(
        select(func.count()).select_from(User).join(Role).where(Role.name == "admin", User.is_active.is_(True))
    ) or 0


def update_user(db: Session, admin: User, user_id: uuid.UUID, changes: dict) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    demoting = "role" in changes and changes["role"] != "admin" and user.role.name == "admin"
    disabling = changes.get("is_active") is False and user.is_active
    if user.id == admin.id and (demoting or disabling):
        raise HTTPException(400, "You cannot remove your own admin access")
    if (demoting or disabling) and user.role.name == "admin" and user.is_active and _active_admins(db) <= 1:
        raise HTTPException(400, "The firm must keep at least one active admin")
    if "role" in changes:
        user.role_id = get_role(db, changes.pop("role")).id
    if changes.get("is_active") is False:
        user.invite_token_hash = None  # a disabled account cannot be activated by an old link
        user.invite_expires_at = None
    for k, v in changes.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


def reissue_invite(db: Session, user_id: uuid.UUID) -> tuple[User, str]:
    """New invite (or access-reset) link. An active user keeps working until they use it."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    token = issue_invite(user)
    db.commit()
    return user, token


def record_login(db: Session, user: User) -> None:
    user.last_login_at = _now()
    db.commit()
