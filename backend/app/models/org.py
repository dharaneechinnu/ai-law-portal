import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, String, Table, Column, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TimestampMixin

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Firm(IdMixin, TimestampMixin, Base):
    __tablename__ = "firms"
    name: Mapped[str] = mapped_column(String(200))
    settings: Mapped[dict] = mapped_column(JSON, default=dict)  # kill switch, retention, etc.


class Permission(IdMixin, Base):
    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(String(300))


class Role(IdMixin, Base):
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(50), unique=True)  # admin, partner, lawyer, associate, paralegal
    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions)


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"
    firm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("firms.id"))
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"))
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    designation: Mapped[str | None] = mapped_column(String(100))
    practice_areas: Mapped[list] = mapped_column(JSON, default=list)
    phone: Mapped[str | None] = mapped_column(String(50))
    office_location: Mapped[str | None] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    working_hours: Mapped[dict] = mapped_column(JSON, default=dict)
    notification_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    daily_briefing_time: Mapped[str | None] = mapped_column(String(5))  # "HH:MM" local to user's tz
    ai_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[Role] = relationship()


class Client(IdMixin, TimestampMixin, Base):
    __tablename__ = "clients"
    firm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("firms.id"))
    name: Mapped[str] = mapped_column(String(200), index=True)
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Matter(IdMixin, TimestampMixin, Base):
    __tablename__ = "matters"
    firm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("firms.id"))
    matter_number: Mapped[str] = mapped_column(String(50), unique=True)
    case_number: Mapped[str | None] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"))
    court: Mapped[str | None] = mapped_column(String(200))
    jurisdiction: Mapped[str | None] = mapped_column(String(200))
    practice_area: Mapped[str | None] = mapped_column(String(100))
    assigned_lawyer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30), default="active")  # active/closed/archived
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    filing_date: Mapped[date | None] = mapped_column(Date)
    next_hearing: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    important_dates: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    legal_issues: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (Index("ix_matters_status_lawyer", "status", "assigned_lawyer_id"),)


class MatterMember(IdMixin, Base):
    __tablename__ = "matter_members"
    matter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matters.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")


class TimelineEvent(IdMixin, Base):
    """DB-backed matter timeline. Written by services, never by the LLM."""

    __tablename__ = "timeline_events"
    matter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matters.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(300))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_timeline_matter_time", "matter_id", "occurred_at"),)
