from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import User
from app.schemas import FirmSettings
from app.services import audit, firm_settings

router = APIRouter(prefix="/settings/firm", tags=["settings"], dependencies=[Depends(require_roles("admin"))])


@router.get("", response_model=FirmSettings)
def read(db: Session = Depends(get_db)):
    return firm_settings.read_all(db)


@router.put("", response_model=FirmSettings)
def save(body: FirmSettings, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    before = firm_settings.read_all(db)
    try:
        after = firm_settings.save(db, body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    changed = {k: {"from": before[k], "to": v} for k, v in after.items() if before[k] != v}
    if changed:
        audit.record(db, action="FIRM_SETTINGS_CHANGED", user_id=user.id, executed=True, result=changed)
    db.commit()
    return after
