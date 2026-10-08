"""Local CalendarProvider: events live in our own calendar_events table. Google/Outlook adapters slot in later."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CalendarEvent
from app.providers.base import CalendarProvider, CalendarSlot


class LocalCalendarProvider(CalendarProvider):
    def __init__(self, db: Session):
        self.db = db

    async def free_busy(self, user_id: str, start: datetime, end: datetime) -> list[CalendarSlot]:
        uid = uuid.UUID(str(user_id))
        events = self.db.scalars(select(CalendarEvent).where(
            CalendarEvent.status != "cancelled", CalendarEvent.starts_at < end, CalendarEvent.ends_at > start,
        )).all()
        return [CalendarSlot(start=e.starts_at, end=e.ends_at, meta={"event_id": str(e.id), "title": e.title})
                for e in events if e.owner_id == uid or str(uid) in (e.attendee_ids or [])]

    async def create_event(self, user_id: str, title: str, start: datetime, end: datetime, **kw: Any) -> str:
        event = CalendarEvent(owner_id=uuid.UUID(str(user_id)), title=title, starts_at=start, ends_at=end,
                              location=kw.get("location"), matter_id=kw.get("matter_id"),
                              attendee_ids=[str(a) for a in kw.get("attendee_ids", [])], provider="local")
        self.db.add(event)
        self.db.flush()
        return str(event.id)

    async def cancel_event(self, event_id: str) -> None:
        event = self.db.get(CalendarEvent, uuid.UUID(str(event_id)))
        if event:
            event.status = "cancelled"
