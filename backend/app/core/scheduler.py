"""In-process scheduler (APScheduler). Runs inside the API process; set SCHEDULER_ENABLED=false to turn it off."""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import User
from app.services import briefing, notifications

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def run_due_briefings() -> None:
    """Every minute: build today's briefing for users whose briefing time is now and who have none yet."""
    with SessionLocal() as db:
        users = db.scalars(select(User).where(User.is_active.is_(True), User.daily_briefing_time.is_not(None))).all()
        for user in users:
            if briefing.due_now(user) and not briefing.today_for(db, user):
                try:
                    b = await briefing.generate(db, user)
                    notifications.notify(db, user.id, "briefing", "Your daily briefing is ready", body=b.summary[:200],
                                         link="/", dedupe_key=f"briefing:{b.for_date.isoformat()}")
                    db.commit()
                except Exception:
                    db.rollback()
                    log.exception("Daily briefing failed for user %s", user.id)


def run_reminders() -> None:
    with SessionLocal() as db:
        try:
            notifications.send_reminders(db)
        except Exception:
            db.rollback()
            log.exception("Reminder run failed")


def start() -> None:
    scheduler.add_job(run_due_briefings, "cron", minute="*", id="daily_briefings", replace_existing=True,
                      max_instances=1, coalesce=True)
    scheduler.add_job(run_reminders, "cron", minute="*/5", id="reminders", replace_existing=True,
                      max_instances=1, coalesce=True)
    scheduler.start()


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
