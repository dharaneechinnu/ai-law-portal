"""'My case vs judgment' comparison. Analysis only: never predicts an outcome, never legal advice."""
import json
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Court, Judgment, LegalDevelopment, Matter, MatterLegalMatch
from app.services import ai_registry

DISCLAIMER = "AI analysis to support a lawyer's review. Not legal advice and not a prediction of any outcome."

SYSTEM = (
    "You compare a law firm's matter with a court judgment or order to help a lawyer decide whether to read it. "
    "Use ONLY the information given. Do not predict how the matter will be decided, do not estimate chances of "
    "success, and do not give legal advice. If the information is too thin to compare a point, say so. "
    "Reply with JSON only, no prose, in this shape: "
    '{"same": [string], "different": [string], "potential_impact": string, "recommended_review": [string]}'
)


def _matter_block(m: Matter) -> str:
    return "\n".join(f"{k}: {v}" for k, v in [
        ("Title", m.title), ("Court", m.court), ("Jurisdiction", m.jurisdiction), ("Practice area", m.practice_area),
        ("Legal issues", "; ".join(m.legal_issues or [])), ("Description", m.description),
    ] if v)


def _judgment_block(j: Judgment, court: Court | None) -> str:
    return "\n".join(f"{k}: {v}" for k, v in [
        ("Type", j.kind), ("Title", j.title), ("Court", court.name if court else None),
        ("Date", j.judgment_date.isoformat() if j.judgment_date else None),
        ("Provisions", "; ".join(j.provisions or [])), ("Summary", j.summary),
        ("Text (excerpt)", (j.full_text or "")[:8000]),
    ] if v)


def _parse(answer: str) -> dict:
    found = re.search(r"\{.*\}", answer, re.S)
    try:
        data = json.loads(found.group(0)) if found else {}
    except json.JSONDecodeError:
        data = {}
    as_list = lambda v: [str(x) for x in v] if isinstance(v, list) else ([str(v)] if v else [])  # noqa: E731
    return {
        "same": as_list(data.get("same")),
        "different": as_list(data.get("different")),
        "potential_impact": str(data.get("potential_impact") or ""),
        "recommended_review": as_list(data.get("recommended_review")),
        "raw": None if data else answer[:4000],
    }


async def compare(db: Session, match: MatterLegalMatch) -> dict:
    matter = db.get(Matter, match.matter_id)
    j = db.get(Judgment, db.get(LegalDevelopment, match.development_id).judgment_id)
    court = db.get(Court, j.court_id) if j.court_id else None
    if not (j.summary or j.full_text):
        raise ValueError("This judgment has no summary or text to compare. Check the eCourts field mapping.")
    llm = ai_registry.get_llm(db)
    answer = await llm.complete([
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"MATTER\n{_matter_block(matter)}\n\nJUDGMENT\n{_judgment_block(j, court)}"},
    ])
    result = {**_parse(answer), "label": DISCLAIMER, "generated_at": datetime.now(timezone.utc).isoformat()}
    match.comparison = result
    db.commit()
    return result
