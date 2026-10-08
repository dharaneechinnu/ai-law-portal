import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import Court, Judgment, LegalDevelopment, Matter, MatterLegalMatch, User
from app.providers.ecourts import NotConfigured
from app.schemas import (JudgmentOut, LegalCaseOut, LegalSourceIn, LegalSourceOut, LegalSyncIn, LegalSyncOut,
                         MatchOut, MatchStatusIn)
from app.services import ai_registry, legal_compare, legal_data, legal_sync
from app.services.legal_match import alert_threshold
from app.services.matters import add_timeline

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


def _match_rows(db: Session, *where) -> list[MatchOut]:
    threshold = alert_threshold(db)
    rows = db.execute(
        select(MatterLegalMatch, Matter, LegalDevelopment, Judgment, Court)
        .join(Matter, Matter.id == MatterLegalMatch.matter_id)
        .join(LegalDevelopment, LegalDevelopment.id == MatterLegalMatch.development_id)
        .join(Judgment, Judgment.id == LegalDevelopment.judgment_id)
        .outerjoin(Court, Court.id == Judgment.court_id)
        .where(*where)
        .order_by(MatterLegalMatch.relevance.desc(), LegalDevelopment.detected_at.desc())
        .limit(200)
    ).all()
    return [
        MatchOut(id=mm.id, matter_id=m.id, matter_title=m.title, matter_number=m.matter_number,
                 relevance=mm.relevance, signals=mm.signals, status=mm.status, is_alert=mm.relevance >= threshold,
                 comparison=mm.comparison, detected_at=dev.detected_at,
                 judgment=JudgmentOut.model_validate(j).model_copy(update={"court_name": c.name if c else None}))
        for mm, m, dev, j, c in rows
    ]


@router.get("/alerts", response_model=list[MatchOut])
def alerts(status: str = "new", db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """High-relevance matches across all matters (dashboard / Legal Intelligence page)."""
    where = [MatterLegalMatch.relevance >= alert_threshold(db)]
    if status != "all":
        where.append(MatterLegalMatch.status == status)
    return _match_rows(db, *where)


@router.get("/matters/{matter_id}/matches", response_model=list[MatchOut])
def matter_matches(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id)
    return _match_rows(db, MatterLegalMatch.matter_id == matter_id)


def _match_or_404(db: Session, match_id: uuid.UUID) -> MatterLegalMatch:
    match = db.get(MatterLegalMatch, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    return match


@router.patch("/matches/{match_id}", response_model=MatchOut)
def set_match_status(match_id: uuid.UUID, body: MatchStatusIn, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    match = _match_or_404(db, match_id)
    if match.status != body.status:
        match.status = body.status
        match.reviewed_by = user.id if body.status != "new" else None
        add_timeline(db, match.matter_id, f"legal_match_{body.status}", f"Legal match marked {body.status}", user.id,
                     {"match_id": str(match.id)})
        db.commit()
    return _match_rows(db, MatterLegalMatch.id == match.id)[0]


@router.post("/matches/{match_id}/compare", response_model=MatchOut,
             dependencies=[Depends(require_roles("admin", "partner", "lawyer", "associate"))])
async def compare_match(match_id: uuid.UUID, db: Session = Depends(get_db)):
    match = _match_or_404(db, match_id)
    try:
        await legal_compare.compare(db, match)
    except Exception as e:
        raise _provider_error(e)
    return _match_rows(db, MatterLegalMatch.id == match.id)[0]
