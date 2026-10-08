"""Daily briefing. Facts are read from the database; the AI (when configured) only words a short summary of them."""
import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Briefing, User
from app.services import ai_registry
from app.services.calendar import items_between
from app.services.dashboard import build_dashboard, day_bounds

log = logging.getLogger(__name__)

PROMPT = (
    "You write a lawyer's morning briefing. Use ONLY the facts in the JSON. Write 2 or 3 short sentences, most urgent "
    "first: hearings, overdue work, then today's tasks, meetings and legal alerts. Plain words. No greeting, no advice, "
    "no predictions, nothing that is not in the facts. If there is nothing, say the day is clear."
)


def local_today(user: User):
    return datetime.now(ZoneInfo(user.timezone)).date()


def _clock(iso: str | None, tz: str) -> str:
    if not iso:
        return ""
    return datetime.fromisoformat(iso).astimezone(ZoneInfo(tz)).strftime("%I:%M %p").lstrip("0")


def collect_facts(db: Session, user: User) -> dict:
    d = build_dashboard(db, user)
    start, end = day_bounds(user.timezone)
    meetings = [i for i in items_between(db, user, start, end) if i.kind == "event" and i.status != "cancelled"]
    item = lambda i: {"title": i.title, "at": i.at.isoformat() if i.at else None, "matter": i.matter_title}  # noqa: E731
    return {
        "hearings": [item(i) for i in d.today if i.kind == "hearing"],
        "due_today": [item(i) for i in d.today if i.kind == "task"],
        "overdue": [item(i) for i in d.overdue[:5]],
        "overdue_count": d.stats.overdue_tasks,
        "meetings": [{"title": m.title, "at": m.start.isoformat(), "matter": m.matter_title} for m in meetings],
        "alerts": [{"title": a.title, "matter": a.matter_title} for a in d.alerts],
        "alert_count": d.stats.new_alerts,
    }


def facts_summary(f: dict, tz: str) -> str:
    """Plain summary used when no AI model is configured (or the model fails)."""
    parts = []
    for n, one, many in ((len(f["hearings"]), "hearing", "hearings"), (len(f["meetings"]), "meeting", "meetings"),
                         (len(f["due_today"]), "task due", "tasks due"), (f["overdue_count"], "overdue task", "overdue tasks"),
                         (f["alert_count"], "new legal alert", "new legal alerts")):
        if n:
            parts.append(f"{n} {one if n == 1 else many}")
    if not parts:
        return "Your day is clear."
    text = (", ".join(parts[:-1]) + " and " + parts[-1] if len(parts) > 1 else parts[0]) + " today."
    first = sorted([x for x in f["hearings"] + f["meetings"] if x["at"]], key=lambda x: x["at"])
    if first:
        x = first[0]
        text += f" First up: {x['title']} at {_clock(x['at'], tz)}" + (f" ({x['matter']})." if x["matter"] else ".")
    return text[0].upper() + text[1:]


async def generate(db: Session, user: User) -> Briefing:
    """Create or refresh today's briefing for `user`."""
    facts = collect_facts(db, user)
    summary, source = facts_summary(facts, user.timezone), "facts"
    try:
        llm = ai_registry.get_llm(db, "summary")
        text = (await llm.complete([{"role": "system", "content": PROMPT},
                                     {"role": "user", "content": json.dumps(facts, default=str)}])).strip()
        if text:
            summary, source = text[:800], "ai"
    except ai_registry.NotConfigured:
        pass
    except Exception:  # model down or bad reply: keep the factual summary
        log.exception("Briefing AI summary failed for user %s", user.id)
    today = local_today(user)
    b = db.scalar(select(Briefing).where(Briefing.user_id == user.id, Briefing.for_date == today))
    if not b:
        b = Briefing(user_id=user.id, for_date=today)
        db.add(b)
    b.summary, b.facts, b.source = summary, facts, source
    db.commit()
    db.refresh(b)
    return b


def today_for(db: Session, user: User) -> Briefing | None:
    return db.scalar(select(Briefing).where(Briefing.user_id == user.id, Briefing.for_date == local_today(user)))


def due_now(user: User, now: datetime | None = None) -> bool:
    """True in the minute matching the user's briefing time, in their own time zone."""
    if not user.daily_briefing_time:
        return False
    local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(user.timezone))
    return local.strftime("%H:%M") == user.daily_briefing_time
