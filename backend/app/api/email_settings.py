from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import User
from app.schemas import EmailConfigIn, EmailConfigOut
from app.services import email

router = APIRouter(prefix="/settings/email", tags=["settings"], dependencies=[Depends(require_roles("admin"))])


@router.get("", response_model=EmailConfigOut)
def read(db: Session = Depends(get_db)):
    return email.read_config(db)


@router.put("", response_model=EmailConfigOut)
def save(body: EmailConfigIn, db: Session = Depends(get_db)):
    try:
        return email.save_config(db, body)
    except email.NotConfigured as e:
        raise HTTPException(409, str(e))


@router.post("/test")
async def test(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Send a short test email to the admin who clicked the button."""
    try:
        await email.send(db, [user.email], "Test email from your law portal",
                         "Email is set up. Invite links and reminders can now be sent.", actor=user, reason="test")
    except email.NotConfigured as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise HTTPException(400, f"Could not send: {e}")
    return {"ok": True, "sent_to": user.email}
