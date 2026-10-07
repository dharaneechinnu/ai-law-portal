from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.security import create_access_token, verify_password
from app.models import User
from app.schemas import LoginIn, ProfileUpdate, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, name=u.name, email=u.email, role_name=u.role.name, designation=u.designation,
        practice_areas=u.practice_areas or [], phone=u.phone, office_location=u.office_location,
        timezone=u.timezone, working_hours=u.working_hours or {},
        notification_prefs=u.notification_prefs or {}, daily_briefing_time=u.daily_briefing_time,
        ai_prefs=u.ai_prefs or {},
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
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
