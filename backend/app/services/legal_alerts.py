"""Matter-to-judgment matches as the user sees them (Legal Intelligence page, dashboard and agents)."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Court, Judgment, LegalDevelopment, Matter, MatterLegalMatch, User
from app.schemas import JudgmentOut, MatchOut
from app.services.access import visible_matters
from app.services.legal_match import alert_threshold
from app.services.matters import add_timeline


def match_rows(db: Session, user: User, *where) -> list[MatchOut]:
    threshold = alert_threshold(db)
    rows = db.execute(
        select(MatterLegalMatch, Matter, LegalDevelopment, Judgment, Court)
        .join(Matter, Matter.id == MatterLegalMatch.matter_id)
        .join(LegalDevelopment, LegalDevelopment.id == MatterLegalMatch.development_id)
        .join(Judgment, Judgment.id == LegalDevelopment.judgment_id)
        .outerjoin(Court, Court.id == Judgment.court_id)
        .where(visible_matters(user), *where)
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


def alerts(db: Session, user: User, status: str = "new") -> list[MatchOut]:
    """High-relevance matches across all matters the user can open."""
    where = [MatterLegalMatch.relevance >= alert_threshold(db)]
    if status != "all":
        where.append(MatterLegalMatch.status == status)
    return match_rows(db, user, *where)


def match_or_404(db: Session, match_id: uuid.UUID, user: User) -> MatterLegalMatch:
    match = db.get(MatterLegalMatch, match_id)
    if not match or not db.scalar(select(Matter.id).where(Matter.id == match.matter_id, visible_matters(user))):
        raise HTTPException(404, "Match not found")
    return match


def set_status(db: Session, user: User, match: MatterLegalMatch, status: str) -> None:
    """Mark a match new / reviewed / dismissed; the change goes on the matter's timeline."""
    if match.status != status:
        match.status = status
        match.reviewed_by = user.id if status != "new" else None
        add_timeline(db, match.matter_id, f"legal_match_{status}", f"Legal match marked {status}", user.id,
                     {"match_id": str(match.id)})
