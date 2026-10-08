"""Dashboard action center: what needs attention today, limited to matters the user may see."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import Court, Document, Judgment, LegalDevelopment, Matter, MatterLegalMatch, MatterMember, User
from app.schemas import DashAlert, DashboardLayout, DashboardOut, DashDocument, DashMatter
from app.services.access import visible_matters
from app.services.legal_match import alert_threshold

# Cards for features that exist today. New cards are added here as their features ship.
CARDS = ["stats", "hearings", "alerts", "my_matters", "documents"]
HEARING_DAYS = 14
PRIORITY_RANK = case({"urgent": 0, "high": 1, "medium": 2, "low": 3}, value=Matter.priority, else_=4)


def get_layout(user: User) -> DashboardLayout:
    saved = (user.ui_prefs or {}).get("dashboard") or {}
    order = [c for c in saved.get("order", []) if c in CARDS]
    order += [c for c in CARDS if c not in order]  # new cards appear at the end
    return DashboardLayout(order=order, hidden=[c for c in saved.get("hidden", []) if c in CARDS])


def save_layout(db: Session, user: User, layout: DashboardLayout) -> DashboardLayout:
    unknown = (set(layout.order) | set(layout.hidden)) - set(CARDS)
    if unknown:
        raise ValueError(f"Unknown dashboard cards: {', '.join(sorted(unknown))}")
    user.ui_prefs = {**(user.ui_prefs or {}), "dashboard": {"order": layout.order, "hidden": layout.hidden}}
    db.commit()
    return get_layout(user)


def _dm(m: Matter) -> DashMatter:
    return DashMatter(id=m.id, matter_number=m.matter_number, title=m.title, status=m.status, priority=m.priority,
                      court=m.court, next_hearing=m.next_hearing, restricted=m.restricted)


def build(db: Session, user: User) -> DashboardOut:
    now = datetime.now(timezone.utc)
    visible = visible_matters(user)
    mine = or_(Matter.assigned_lawyer_id == user.id,
               Matter.id.in_(select(MatterMember.matter_id).where(MatterMember.user_id == user.id)))
    active = Matter.status == "active"

    my_matters = db.scalars(
        select(Matter).where(visible, active, mine)
        .order_by(PRIORITY_RANK, Matter.next_hearing.asc().nulls_last(), Matter.created_at.desc()).limit(6)
    ).all()
    hearings = db.scalars(
        select(Matter).where(visible, active, Matter.next_hearing >= now - timedelta(hours=12),
                             Matter.next_hearing <= now + timedelta(days=HEARING_DAYS))
        .order_by(Matter.next_hearing).limit(8)
    ).all()

    threshold = alert_threshold(db)
    alert_q = (
        select(MatterLegalMatch, Matter, Judgment, LegalDevelopment)
        .join(Matter, Matter.id == MatterLegalMatch.matter_id)
        .join(LegalDevelopment, LegalDevelopment.id == MatterLegalMatch.development_id)
        .join(Judgment, Judgment.id == LegalDevelopment.judgment_id)
        .where(visible, MatterLegalMatch.status == "new", MatterLegalMatch.relevance >= threshold)
    )
    alerts = db.execute(alert_q.order_by(MatterLegalMatch.relevance.desc()).limit(5)).all()
    alert_count = db.scalar(select(func.count()).select_from(alert_q.subquery())) or 0

    doc_q = (select(Document, Matter).join(Matter, Matter.id == Document.matter_id)
             .where(visible, Document.status.in_(["failed", "uploaded", "processing"])))
    docs = db.execute(doc_q.order_by(Document.created_at.desc()).limit(6)).all()
    doc_count = db.scalar(select(func.count()).select_from(doc_q.subquery())) or 0

    courts = {c.id: c.name for c in db.scalars(select(Court).where(Court.id.in_({j.court_id for _, _, j, _ in alerts})))}

    return DashboardOut(
        layout=get_layout(user),
        stats={
            "my_matters": db.scalar(select(func.count()).select_from(Matter).where(visible, active, mine)) or 0,
            "hearings": db.scalar(select(func.count()).select_from(Matter).where(
                visible, active, Matter.next_hearing >= now - timedelta(hours=12),
                Matter.next_hearing <= now + timedelta(days=HEARING_DAYS))) or 0,
            "alerts": alert_count,
            "documents": doc_count,
        },
        my_matters=[_dm(m) for m in my_matters],
        hearings=[_dm(m) for m in hearings],
        alerts=[DashAlert(id=mm.id, matter_id=m.id, matter_title=m.title, title=j.title or j.external_judgment_id,
                          kind=j.kind, court_name=courts.get(j.court_id), relevance=mm.relevance,
                          detected_at=dev.detected_at) for mm, m, j, dev in alerts],
        documents=[DashDocument(id=d.id, matter_id=m.id, matter_title=m.title, filename=d.filename, status=d.status,
                                error=d.error, created_at=d.created_at) for d, m in docs],
    )
