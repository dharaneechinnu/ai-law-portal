"""Matter-to-judgment matching. Every score keeps its per-signal breakdown so it is explainable.

Signals (each 0..1, or None when there is nothing to compare; None signals are left out and the
remaining weights are renormalized):
  semantic    cosine similarity between the matter's and the judgment's embeddings
  provisions  share of the matter's legal issues that the judgment cites or mentions
  court       same court (1), same jurisdiction/state (0.5), otherwise 0
  case_type   matter practice area appears in the judgment's case type/title
  facts       keyword overlap between matter description and judgment summary
  recency     1 within 30 days, falling linearly to 0 at two years
"""
import math
import re
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Court, Firm, Judgment, LegalCase, LegalDevelopment, Matter, MatterLegalMatch
from app.services.matters import add_timeline
from app.services.notifications import matter_team, notify

WEIGHTS = {"semantic": 0.35, "provisions": 0.2, "facts": 0.15, "court": 0.1, "case_type": 0.1, "recency": 0.1}
MIN_MATCH = 0.3  # below this a match is not stored
DEFAULT_ALERT_THRESHOLD = 0.6  # at or above this a match is an alert; firm setting "legal_alert_threshold"

STOP = set("""a an the and or of to in on for by with from at as is are was were be been this that these those it its
which who whom under section act vs v versus case court high supreme district order judgment petitioner respondent
appellant state india shall not no any all such other said""".split())


def alert_threshold(db: Session) -> float:
    firm = db.scalar(select(Firm))
    value = (firm.settings or {}).get("legal_alert_threshold") if firm else None
    try:
        return float(value) if value is not None else DEFAULT_ALERT_THRESHOLD
    except (TypeError, ValueError):
        return DEFAULT_ALERT_THRESHOLD


def matter_text(m: Matter) -> str:
    return " ".join(filter(None, [m.title, m.practice_area, m.court, m.jurisdiction, m.description,
                                  "; ".join(m.legal_issues or [])]))


def judgment_text(j: Judgment, court_name: str | None) -> str:
    return " ".join(filter(None, [j.title, court_name, j.summary, "; ".join(j.provisions or []),
                                  (j.full_text or "")[:4000]]))


def _tokens(text: str | None) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in STOP}


def _norm(text: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (text or "").lower())).strip()


def _cosine(a: list[float] | None, b: list[float] | None) -> float | None:
    if not a or not b:
        return None
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return max(0.0, dot / (na * nb)) if na and nb else None


def _provisions(m: Matter, j: Judgment) -> float | None:
    issues = [i for i in (m.legal_issues or []) if _norm(i)]
    if not issues:
        return None
    haystack = _norm(" ".join([*(j.provisions or []), j.title or "", j.summary or "", (j.full_text or "")[:20000]]))
    hits = 0
    for issue in issues:
        n = _norm(issue)
        sec = re.search(r"(?:section|sec|s)\s*(\d+[a-z]?)", n)
        if n in haystack or (sec and re.search(rf"(?:section|sec|s)\s*{sec.group(1)}\b", haystack)):
            hits += 1
    return hits / len(issues)


def _court(m: Matter, court: Court | None) -> float | None:
    if not court or not (m.court or m.jurisdiction):
        return None
    cn, mc = _norm(court.name), _norm(m.court)
    if mc and (mc in cn or cn in mc):
        return 1.0
    place = _norm(m.jurisdiction)
    if place and (place in cn or (court.state and place in _norm(court.state))):
        return 0.5
    return 0.0


def _case_type(m: Matter, j: Judgment, lc: LegalCase | None) -> float | None:
    if not m.practice_area:
        return None
    area = _tokens(m.practice_area)
    target = _tokens(" ".join(filter(None, [lc.case_type if lc else None, j.title, j.summary])))
    return 1.0 if area and area & target else 0.0


def _facts(m: Matter, j: Judgment) -> float | None:
    a, b = _tokens(m.description), _tokens(" ".join(filter(None, [j.summary, (j.full_text or "")[:4000]])))
    if not a or not b:
        return None
    return min(1.0, len(a & b) / max(5, min(len(a), len(b))))


def _recency(j: Judgment) -> float | None:
    if not j.judgment_date:
        return None
    days = (date.today() - j.judgment_date).days
    if days <= 30:
        return 1.0
    return max(0.0, 1 - (days - 30) / (730 - 30))


def score(m: Matter, j: Judgment, court: Court | None, lc: LegalCase | None,
          mvec: list[float] | None, jvec: list[float] | None) -> tuple[float, dict]:
    signals = {
        "semantic": _cosine(mvec, jvec),
        "provisions": _provisions(m, j),
        "facts": _facts(m, j),
        "court": _court(m, court),
        "case_type": _case_type(m, j, lc),
        "recency": _recency(j),
    }
    used = {k: v for k, v in signals.items() if v is not None}
    # Recency alone says nothing about relevance; require at least one content signal.
    if not used.keys() - {"recency"}:
        return 0.0, {"signals": signals, "weights": WEIGHTS}
    total_w = sum(WEIGHTS[k] for k in used)
    relevance = sum(WEIGHTS[k] * v for k, v in used.items()) / total_w
    return round(relevance, 4), {"signals": {k: (round(v, 4) if v is not None else None) for k, v in signals.items()},
                                 "weights": WEIGHTS}


def match_developments(db: Session, developments: list[LegalDevelopment], jvecs: dict[uuid.UUID, list[float]],
                       mvecs: dict[uuid.UUID, list[float]]) -> tuple[int, int]:
    """Score each new development against every active matter. Returns (matches stored, alerts)."""
    matters = db.scalars(select(Matter).where(Matter.status == "active")).all()
    threshold = alert_threshold(db)
    stored = alerts = 0
    for dev in developments:
        j = db.get(Judgment, dev.judgment_id)
        court = db.get(Court, j.court_id) if j.court_id else None
        lc = db.get(LegalCase, j.legal_case_id) if j.legal_case_id else None
        for m in matters:
            exists = db.scalar(select(MatterLegalMatch).where(MatterLegalMatch.matter_id == m.id,
                                                              MatterLegalMatch.development_id == dev.id))
            if exists:
                continue
            relevance, signals = score(m, j, court, lc, mvecs.get(m.id), jvecs.get(j.id))
            if relevance < MIN_MATCH:
                continue
            db.add(MatterLegalMatch(matter_id=m.id, development_id=dev.id, relevance=relevance, signals=signals))
            stored += 1
            if relevance >= threshold:
                alerts += 1
                add_timeline(db, m.id, "judgment_detected",
                             f"Relevant {j.kind} detected: {j.title or j.external_judgment_id}",
                             detail={"judgment_id": str(j.id), "relevance": relevance})
                for uid in matter_team(db, m.id):
                    notify(db, uid, "legal", f"Relevant {j.kind}: {m.title}", body=j.title, link=f"/matters/{m.id}",
                           dedupe_key=f"legal:{dev.id}:{m.id}")
    return stored, alerts
