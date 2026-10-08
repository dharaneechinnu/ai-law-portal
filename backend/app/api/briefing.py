from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import User
from app.schemas import BriefingOut
from app.services import briefing

router = APIRouter(prefix="/briefing", tags=["briefing"])


@router.get("/today", response_model=BriefingOut | None)
def get_today(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return briefing.today_for(db, user)


@router.post("/today", response_model=BriefingOut)
async def make_today(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Build (or rebuild) today's briefing now, without waiting for the scheduled time."""
    return await briefing.generate(db, user)
