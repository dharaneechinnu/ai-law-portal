import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin


class Task(IdMixin, TimestampMixin, Base):
    __tablename__ = "tasks"
    matter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("matters.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open/done/archived
    kind: Mapped[str] = mapped_column(String(30), default="task")  # task/follow_up/deadline
    created_by_agent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (Index("ix_tasks_assignee_due", "assignee_id", "status", "due_at"),)


class TaskDependency(IdMixin, Base):
    __tablename__ = "task_dependencies"
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    depends_on_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))


class CalendarEvent(IdMixin, TimestampMixin, Base):
    __tablename__ = "calendar_events"
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    matter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("matters.id"))
    title: Mapped[str] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(300))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attendee_ids: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(30), default="local")
    external_event_id: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    __table_args__ = (Index("ix_events_owner_time", "owner_id", "starts_at", "ends_at"),)


class Hearing(IdMixin, TimestampMixin, Base):
    __tablename__ = "hearings"
    matter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matters.id"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    court_room: Mapped[str | None] = mapped_column(String(100))
    purpose: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    outcome: Mapped[str | None] = mapped_column(Text)


class Notification(IdMixin, Base):
    __tablename__ = "notifications"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # briefing/hearing/overdue/legal/approval...
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    dedupe_key: Mapped[str | None] = mapped_column(String(200), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Briefing(IdMixin, TimestampMixin, Base):
    """One daily briefing per user per local day. Facts come from the database; the AI only words the summary."""

    __tablename__ = "briefings"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    for_date: Mapped[date] = mapped_column(Date)
    summary: Mapped[str] = mapped_column(Text)
    facts: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(20), default="facts")  # ai / facts
    __table_args__ = (UniqueConstraint("user_id", "for_date"),)
