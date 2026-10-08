from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import User
from app.services import analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
def overview(days: int = 30, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Firm, legal-intelligence and AI numbers for the last `days` (7, 30 or 90), limited to what the viewer can see."""
    if days not in (7, 30, 90):
        raise HTTPException(400, "Choose 7, 30 or 90 days")
    return analytics.overview(db, user, days)
