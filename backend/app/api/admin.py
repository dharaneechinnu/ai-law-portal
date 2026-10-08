import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models import User
from app.schemas import AdminUserCreate, AdminUserCreated, AdminUserOut, AdminUserUpdate
from app.services import users as users_svc

router = APIRouter(prefix="/admin/users", tags=["admin"])
admin_only = require_roles("admin")


def admin_user_out(u: User) -> AdminUserOut:
    status = users_svc.status_of(u)
    return AdminUserOut(
        id=u.id, name=u.name, email=u.email, role_name=u.role.name, designation=u.designation, status=status,
        invite_expires_at=u.invite_expires_at if u.invite_token_hash else None,
        last_login_at=u.last_login_at, created_at=u.created_at,
    )


@router.get("", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    return [admin_user_out(u) for u in db.scalars(select(User).order_by(User.created_at.desc())).all()]


@router.post("", response_model=AdminUserCreated, status_code=201)
def create_user(body: AdminUserCreate, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    user, token = users_svc.create_user(
        db, admin, name=body.name.strip(), email=body.email, role=body.role,
        designation=(body.designation or "").strip() or None, password=body.password or None,
    )
    return AdminUserCreated(user=admin_user_out(user), invite_token=token)


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(user_id: uuid.UUID, body: AdminUserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(admin_only)):
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}  # null = leave unchanged
    return admin_user_out(users_svc.update_user(db, admin, user_id, changes))


@router.post("/{user_id}/invite", response_model=AdminUserCreated)
def reissue_invite(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    user, token = users_svc.reissue_invite(db, user_id)
    return AdminUserCreated(user=admin_user_out(user), invite_token=token)
