import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin


class Court(IdMixin, Base):
    __tablename__ = "courts"
    name: Mapped[str] = mapped_column(String(300))
    level: Mapped[str | None] = mapped_column(String(50))  # supreme/high/district
    state: Mapped[str | None] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(50))
    external_court_id: Mapped[str | None] = mapped_column(String(100))
    __table_args__ = (UniqueConstraint("provider", "external_court_id"),)


class LegalCase(IdMixin, TimestampMixin, Base):
    __tablename__ = "legal_cases"
    provider: Mapped[str] = mapped_column(String(50))
    external_case_id: Mapped[str] = mapped_column(String(200))
    court_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courts.id"))
    case_number: Mapped[str | None] = mapped_column(String(150))
    title: Mapped[str | None] = mapped_column(String(500))
    case_type: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str | None] = mapped_column(String(50))
    filing_date: Mapped[date | None] = mapped_column(Date)
    source_url: Mapped[str | None] = mapped_column(String(1000))
    raw: Mapped[dict] = mapped_column(JSON, default=dict)  # untouched provider payload, for debugging only
    __table_args__ = (UniqueConstraint("provider", "external_case_id"),)


class Party(IdMixin, Base):
    __tablename__ = "parties"
    legal_case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("legal_cases.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(300))
    role: Mapped[str | None] = mapped_column(String(50))  # petitioner/respondent/advocate


class LegalProvision(IdMixin, Base):
    __tablename__ = "legal_provisions"
    act: Mapped[str] = mapped_column(String(300))
    section: Mapped[str | None] = mapped_column(String(100))
    __table_args__ = (UniqueConstraint("act", "section"),)


class Judgment(IdMixin, TimestampMixin, Base):
    __tablename__ = "judgments"
    provider: Mapped[str] = mapped_column(String(50))
    external_judgment_id: Mapped[str] = mapped_column(String(200))
    legal_case_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("legal_cases.id"))
    court_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courts.id"))
    title: Mapped[str | None] = mapped_column(String(500))
    judgment_date: Mapped[date | None] = mapped_column(Date, index=True)
    bench: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str | None] = mapped_column(Text)
    full_text: Mapped[str | None] = mapped_column(Text)
    provisions: Mapped[list] = mapped_column(JSON, default=list)
    outcome: Mapped[str | None] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(String(1000))
    __table_args__ = (UniqueConstraint("provider", "external_judgment_id"),)


class LegalDevelopment(IdMixin, TimestampMixin, Base):
    """An alert-worthy new judgment/order, shown on the dashboard."""

    __tablename__ = "legal_developments"
    judgment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("judgments.id"), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="new")  # new/reviewed/dismissed


class MatterLegalMatch(IdMixin, TimestampMixin, Base):
    __tablename__ = "matter_legal_matches"
    matter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matters.id"), index=True)
    development_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("legal_developments.id"), index=True)
    relevance: Mapped[float] = mapped_column(Float)  # 0..1
    signals: Mapped[dict] = mapped_column(JSON, default=dict)  # per-signal breakdown => explainable
    comparison: Mapped[dict | None] = mapped_column(JSON)  # same/different/impact/recommended_review
    status: Mapped[str] = mapped_column(String(20), default="new")
    __table_args__ = (Index("ix_match_matter_rel", "matter_id", "relevance"),)
