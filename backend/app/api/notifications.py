import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Notification, User
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.created_at.desc()).limit(50)).all()


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    n = db.scalar(select(func.count()).select_from(Notification)
                  .where(Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return {"unread": n}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    if not n.read_at:
        n.read_at = datetime.now(timezone.utc)
        db.commit()
    return n


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    result = db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                        .values(read_at=datetime.now(timezone.utc)))
    db.commit()
    return {"updated": result.rowcount}
