import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import MatterLegalMatch, User
from app.providers.ecourts import NotConfigured
from app.schemas import LegalCaseOut, LegalSourceIn, LegalSourceOut, LegalSyncIn, LegalSyncOut, MatchOut, MatchStatusIn
from app.services import ai_registry, legal_alerts, legal_compare, legal_data, legal_sync

settings_router = APIRouter(prefix="/settings/legal", tags=["settings"],
                            dependencies=[Depends(require_roles("admin"))])
router = APIRouter(prefix="/legal", tags=["legal"])


def _provider_error(e: Exception) -> HTTPException:
    if isinstance(e, (NotConfigured, ai_registry.NotConfigured, ValueError)):
        return HTTPException(400, str(e))
    if isinstance(e, httpx.HTTPStatusError):
        return HTTPException(502, f"eCourts returned HTTP {e.response.status_code}")
    if isinstance(e, httpx.HTTPError):
        return HTTPException(502, f"Could not reach eCourts: {e.__class__.__name__}")
    raise e


# ---------- settings (admin only) ----------

@settings_router.get("", response_model=LegalSourceOut)
def get_source(db: Session = Depends(get_db)):
    return legal_data.read_config(db)


@settings_router.put("", response_model=LegalSourceOut)
def put_source(body: LegalSourceIn, db: Session = Depends(get_db)):
    legal_data.save_config(db, body)
    return legal_data.read_config(db)


@settings_router.post("/test")
async def test_source(db: Session = Depends(get_db)):
    """Calls the configured 'test' endpoint with the saved key."""
    try:
        await legal_data.get_provider(db).test_connection()
    except Exception as e:
        raise _provider_error(e)
    return {"ok": True}


# ---------- legal intelligence ----------

@router.post("/sync", response_model=LegalSyncOut, dependencies=[Depends(require_roles("admin", "partner", "lawyer"))])
async def run_sync(body: LegalSyncIn, db: Session = Depends(get_db)):
    """Manual sync. Scheduling is decided later; it would call the same service."""
    try:
        return await legal_sync.sync(db, body)
    except Exception as e:
        db.rollback()
        raise _provider_error(e)


@router.get("/cases/search", response_model=list[LegalCaseOut])
async def search_cases(q: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return await legal_data.get_provider(db).search_cases(q)
    except Exception as e:
        raise _provider_error(e)


@router.get("/alerts", response_model=list[MatchOut])
def alerts(status: str = "new", db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """High-relevance matches across all matters (dashboard / Legal Intelligence page)."""
    return legal_alerts.alerts(db, user, status)


@router.get("/matters/{matter_id}/matches", response_model=list[MatchOut])
def matter_matches(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id, user)
    return legal_alerts.match_rows(db, user, MatterLegalMatch.matter_id == matter_id)


@router.patch("/matches/{match_id}", response_model=MatchOut)
def set_match_status(match_id: uuid.UUID, body: MatchStatusIn, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    match = legal_alerts.match_or_404(db, match_id, user)
    legal_alerts.set_status(db, user, match, body.status)
    db.commit()
    return legal_alerts.match_rows(db, user, MatterLegalMatch.id == match.id)[0]


@router.post("/matches/{match_id}/compare", response_model=MatchOut,
             dependencies=[Depends(require_roles("admin", "partner", "lawyer", "associate"))])
async def compare_match(match_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    match = legal_alerts.match_or_404(db, match_id, user)
    try:
        await legal_compare.compare(db, match)
    except Exception as e:
        raise _provider_error(e)
    return legal_alerts.match_rows(db, user, MatterLegalMatch.id == match.id)[0]
