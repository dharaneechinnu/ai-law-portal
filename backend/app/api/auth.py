from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.security import create_access_token, verify_password
from app.models import User
from app.schemas import (AcceptInviteIn, InviteInfo, LoginIn, ProfileUpdate, SetupIn, SetupStatus, TokenOut,
                         UserBrief, UserOut)
from app.services import users as users_svc
from app.models import Firm

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, name=u.name, email=u.email, role_name=u.role.name, designation=u.designation,
        practice_areas=u.practice_areas or [], phone=u.phone, office_location=u.office_location,
        timezone=u.timezone, working_hours=u.working_hours or {},
        notification_prefs=u.notification_prefs or {}, daily_briefing_time=u.daily_briefing_time,
        ai_prefs=u.ai_prefs or {}, firm_name=u.firm.name if u.firm else None,
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    users_svc.record_login(db, user)
    return TokenOut(access_token=create_access_token(str(user.id)), user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Role is deliberately not editable here; role changes are admin-only (user management, later sprint).
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return user_out(user)


@router.get("/users", response_model=list[UserBrief])
def list_users(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Active colleagues, for assignee and matter-member pickers."""
    rows = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name)).all()
    return [UserBrief(id=u.id, name=u.name, email=u.email, role_name=u.role.name) for u in rows]


@router.get("/setup", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)):
    firm = db.scalar(select(Firm))
    return SetupStatus(needs_setup=users_svc.needs_setup(db), firm_name=firm.name if firm else None)


@router.post("/setup", response_model=TokenOut, status_code=201)
def setup(body: SetupIn, db: Session = Depends(get_db)):
    """First-run registration of the firm and its first admin. Disabled once any user exists."""
    user = users_svc.setup_firm(db, body.firm_name.strip(), body.name.strip(), body.email, body.password)
    users_svc.record_login(db, user)
    return TokenOut(access_token=create_access_token(str(user.id)), user=user_out(user))


@router.get("/invite/{token}", response_model=InviteInfo)
def invite_info(token: str, db: Session = Depends(get_db)):
    u = users_svc.user_by_invite(db, token)
    return InviteInfo(email=u.email, name=u.name, role_name=u.role.name, firm_name=u.firm.name if u.firm else None)


@router.post("/accept-invite", response_model=TokenOut)
def accept_invite(body: AcceptInviteIn, db: Session = Depends(get_db)):
    user = users_svc.accept_invite(db, body.token, body.password, (body.name or "").strip() or None)
    users_svc.record_login(db, user)
    return TokenOut(access_token=create_access_token(str(user.id)), user=user_out(user))
