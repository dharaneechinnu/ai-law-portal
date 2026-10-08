"""Manual legal data sync: fetch from the configured LegalDataProvider, normalize, dedupe by external ID,
embed, and match new items against open matters. A scheduled run can call `sync` later."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Court, DocumentChunk, Judgment, LegalCase, LegalDataSource, LegalDevelopment, Matter, Party
from app.providers.ecourts import PROVIDER
from app.schemas import LegalSyncIn, LegalSyncOut
from app.services import ai_registry, legal_data
from app.services.ingest import chunk_text, clean
from app.services.legal_match import judgment_text, match_developments, matter_text

SOURCE_TYPE = "judgment"


def _upsert_court(db: Session, c: dict | None) -> Court | None:
    if not c:
        return None
    q = select(Court).where(Court.provider == PROVIDER)
    q = q.where(Court.external_court_id == c["external_court_id"]) if c.get("external_court_id") \
        else q.where(Court.external_court_id.is_(None), Court.name == c["name"])
    court = db.scalar(q)
    if not court:
        court = Court(provider=PROVIDER, name=c["name"], external_court_id=c.get("external_court_id"))
        db.add(court)
    court.name = c["name"]
    court.state = c.get("state") or court.state
    court.level = c.get("level") or court.level
    db.flush()
    return court


def _upsert_case(db: Session, data: dict) -> LegalCase:
    lc = db.scalar(select(LegalCase).where(LegalCase.provider == PROVIDER,
                                           LegalCase.external_case_id == data["external_case_id"]))
    if not lc:
        lc = LegalCase(provider=PROVIDER, external_case_id=data["external_case_id"], raw={})
        db.add(lc)
    court = _upsert_court(db, data.get("court"))
    for field in ("case_number", "title", "case_type", "status", "filing_date", "source_url"):
        if data.get(field) is not None:
            setattr(lc, field, data[field])
    if court:
        lc.court_id = court.id
    if data.get("raw"):
        lc.raw = data["raw"]
    db.flush()
    if data.get("parties"):
        for p in db.scalars(select(Party).where(Party.legal_case_id == lc.id)):
            db.delete(p)
        for p in data["parties"]:
            db.add(Party(legal_case_id=lc.id, name=p["name"][:300], role=p.get("role")))
    return lc


def _upsert_judgment(db: Session, data: dict) -> tuple[Judgment, bool]:
    j = db.scalar(select(Judgment).where(Judgment.provider == PROVIDER,
                                         Judgment.external_judgment_id == data["external_judgment_id"]))
    created = j is None
    if created:
        j = Judgment(provider=PROVIDER, external_judgment_id=data["external_judgment_id"])
        db.add(j)
    court = _upsert_court(db, data.get("court"))
    if court:
        j.court_id = court.id
    if data.get("external_case_id"):
        lc = _upsert_case(db, {"external_case_id": data["external_case_id"], "court": data.get("court")})
        j.legal_case_id = lc.id
    for field in ("kind", "title", "judgment_date", "summary", "full_text", "provisions", "bench", "outcome",
                  "source_url"):
        if data.get(field) not in (None, []):
            setattr(j, field, data[field])
    db.flush()
    return j, created


async def _embed(db: Session, judgments: list[Judgment]) -> tuple[bool, dict, dict]:
    """Chunk + embed new judgments and embed open matters. Skipped (False) if no embedding model is set."""
    try:
        embedder = ai_registry.get_embedder(db)
    except ai_registry.NotConfigured:
        return False, {}, {}
    jvecs: dict[uuid.UUID, list[float]] = {}
    for j in judgments:
        court = db.get(Court, j.court_id) if j.court_id else None
        chunks = chunk_text(clean(judgment_text(j, court.name if court else None)))[:20]
        if not chunks:
            continue
        vecs = await embedder.embed(chunks)
        for i, (text, vec) in enumerate(zip(chunks, vecs)):
            db.add(DocumentChunk(legal_case_id=j.legal_case_id, source_type=SOURCE_TYPE, chunk_index=i,
                                 content=text, embedding=vec,
                                 chunk_meta={"judgment_id": str(j.id), "kind": j.kind,
                                             "date": j.judgment_date.isoformat() if j.judgment_date else None}))
        jvecs[j.id] = vecs[0]
    matters = db.scalars(select(Matter).where(Matter.status == "active")).all()
    texts = [matter_text(m) for m in matters]
    mvecs = dict(zip([m.id for m in matters], await embedder.embed(texts))) if texts else {}
    return True, jvecs, mvecs


async def sync(db: Session, body: LegalSyncIn) -> LegalSyncOut:
    provider = legal_data.get_provider(db)
    if body.mode == "case":
        if not body.external_case_id:
            raise ValueError("external_case_id is required when mode is 'case'")
        _upsert_case(db, await provider.get_case(body.external_case_id))
        items = await provider.get_orders(body.external_case_id)
    elif body.mode == "judgments":
        items = await provider.get_judgments(**body.filters)
    else:
        raise ValueError("mode must be 'judgments' or 'case'")

    new: list[Judgment] = []
    updated = 0
    for data in items:
        j, created = _upsert_judgment(db, data)
        if created:
            new.append(j)
        else:
            updated += 1

    now = datetime.now(timezone.utc)
    developments = [LegalDevelopment(judgment_id=j.id, detected_at=now) for j in new]
    db.add_all(developments)
    db.flush()

    embedded, jvecs, mvecs = await _embed(db, new)
    matches, alerts = match_developments(db, developments, jvecs, mvecs)

    src = db.scalar(select(LegalDataSource).where(LegalDataSource.provider == PROVIDER))
    src.last_synced_at = now
    db.commit()
    return LegalSyncOut(fetched=len(items), new=len(new), updated=updated, matches=matches, alerts=alerts,
                        embedded=embedded)
