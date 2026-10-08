from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import User
from app.schemas import DashboardLayout, DashboardOut
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return dashboard.build(db, user)


@router.put("/layout", response_model=DashboardLayout)
def put_layout(body: DashboardLayout, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Saves the user's card order and hidden cards (their own preference only)."""
    try:
        return dashboard.save_layout(db, user, body)
    except ValueError as e:
        raise HTTPException(400, str(e))
