import uuid
from datetime import date, datetime

import re
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(ORM):
    id: uuid.UUID
    name: str
    email: str
    role_name: str
    designation: str | None = None
    practice_areas: list = []
    phone: str | None = None
    office_location: str | None = None
    timezone: str
    working_hours: dict = {}
    notification_prefs: dict = {}
    daily_briefing_time: str | None = None
    ai_prefs: dict = {}
    dashboard_layout: dict = {}
    firm_name: str | None = None


class TokenOut(BaseModel):
    access_token: str
    user: UserOut


class ProfileUpdate(BaseModel):
    name: str | None = None
    designation: str | None = None
    practice_areas: list | None = None
    phone: str | None = None
    office_location: str | None = None
    timezone: str | None = None
    working_hours: dict | None = None
    notification_prefs: dict | None = None
    daily_briefing_time: str | None = None
    ai_prefs: dict | None = None
    dashboard_layout: dict | None = None

    @field_validator("dashboard_layout")
    @classmethod
    def valid_layout(cls, v):
        if v is None:
            return v
        widgets = v.get("widgets")
        if not isinstance(widgets, list) or len(widgets) > 20:
            raise ValueError("Invalid dashboard layout")
        clean = []
        for w in widgets:
            if not isinstance(w, dict) or not isinstance(w.get("id"), str) or len(w["id"]) > 40:
                raise ValueError("Invalid dashboard layout")
            clean.append({"id": w["id"], "size": "full" if w.get("size") == "full" else "half",
                          "hidden": bool(w.get("hidden"))})
        return {"widgets": clean}

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v):
        if v is not None:
            try:
                ZoneInfo(v)
            except Exception:
                raise ValueError("Unknown time zone")
        return v

    @field_validator("daily_briefing_time")
    @classmethod
    def valid_time(cls, v):
        if v and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
            raise ValueError("Use HH:MM (24-hour)")
        return v or None


class ClientIn(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class ClientOut(ClientIn, ORM):
    id: uuid.UUID


class MatterIn(BaseModel):
    title: str
    client_id: uuid.UUID
    case_number: str | None = None
    court: str | None = None
    jurisdiction: str | None = None
    practice_area: str | None = None
    assigned_lawyer_id: uuid.UUID | None = None
    status: str = "active"
    priority: str = "medium"
    filing_date: date | None = None
    next_hearing: datetime | None = None
    description: str | None = None
    legal_issues: list[str] = []
    restricted: bool = False


class MatterUpdate(BaseModel):
    title: str | None = None
    case_number: str | None = None
    court: str | None = None
    jurisdiction: str | None = None
    practice_area: str | None = None
    assigned_lawyer_id: uuid.UUID | None = None
    status: str | None = None
    priority: str | None = None
    filing_date: date | None = None
    next_hearing: datetime | None = None
    description: str | None = None
    legal_issues: list[str] | None = None
    restricted: bool | None = None


class MatterOut(MatterIn, ORM):
    id: uuid.UUID
    matter_number: str
    created_at: datetime


class TimelineOut(ORM):
    id: uuid.UUID
    event_type: str
    title: str
    detail: dict
    occurred_at: datetime


class DocumentOut(ORM):
    id: uuid.UUID
    matter_id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    status: str
    page_count: int | None
    error: str | None
    created_at: datetime


class AskIn(BaseModel):
    question: str


class Citation(BaseModel):
    document_id: uuid.UUID
    filename: str
    page_number: int | None
    chunk_index: int
    excerpt: str


class AskOut(BaseModel):
    answer: str
    citations: list[Citation]


class AIConfigIn(BaseModel):
    kind: str = "openai_compatible"  # openai_compatible/openai/anthropic/google/azure_openai
    base_url: str | None = None
    api_key: str | None = None  # write-only; omit to keep the stored key
    chat_model: str
    embedding_model: str
    embedding_base_url: str | None = None  # defaults to base_url
    embedding_api_key: str | None = None


class AIConfigOut(BaseModel):
    configured: bool
    kind: str | None = None
    base_url: str | None = None
    chat_model: str | None = None
    embedding_model: str | None = None
    embedding_base_url: str | None = None
    has_api_key: bool = False
    has_embedding_api_key: bool = False


class UserBrief(ORM):
    id: uuid.UUID
    name: str
    email: str
    role_name: str


class MemberIn(BaseModel):
    user_id: uuid.UUID
    role: str = "member"


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    email: str
    role: str


class SetupStatus(BaseModel):
    needs_setup: bool
    firm_name: str | None = None


class SetupIn(BaseModel):
    firm_name: str
    name: str
    email: EmailStr
    password: str


class InviteInfo(BaseModel):
    email: str
    name: str
    role_name: str
    firm_name: str | None = None


class AcceptInviteIn(BaseModel):
    token: str
    password: str
    name: str | None = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role_name: str
    designation: str | None = None
    status: str  # active / invited / disabled
    invite_expires_at: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    role: str = "lawyer"
    designation: str | None = None
    password: str | None = None  # omit to send an invite link instead


class AdminUserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    designation: str | None = None
    is_active: bool | None = None


class AdminUserCreated(BaseModel):
    user: AdminUserOut
    invite_token: str | None = None  # shown once; the frontend turns it into /register?token=...


# ---------- Legal data / Legal Intelligence (Sprint 2) ----------

class LegalSourceIn(BaseModel):
    base_url: str | None = None
    api_key: str | None = None  # write-only; omit to keep the stored key
    config: dict = {}  # auth style, endpoint templates, field mapping (see providers/ecourts.py)
    enabled: bool = True


class LegalSourceOut(BaseModel):
    configured: bool
    provider: str = "ecourts"
    base_url: str | None = None
    has_api_key: bool = False
    config: dict = {}
    enabled: bool = False
    last_synced_at: datetime | None = None


class LegalSyncIn(BaseModel):
    mode: str = "judgments"  # judgments (by filters) / case (one case + its orders)
    filters: dict = {}  # values for the endpoint's {placeholders}, e.g. {"from_date": "2026-01-01"}
    external_case_id: str | None = None


class LegalSyncOut(BaseModel):
    fetched: int
    new: int
    updated: int
    matches: int
    alerts: int
    embedded: bool  # False when no embedding model is configured (semantic signal skipped)


class LegalCaseOut(BaseModel):
    external_case_id: str
    case_number: str | None = None
    title: str | None = None
    case_type: str | None = None
    status: str | None = None
    filing_date: date | None = None
    court: dict | None = None
    parties: list[dict] = []
    source_url: str | None = None


class JudgmentOut(ORM):
    id: uuid.UUID
    kind: str
    external_judgment_id: str
    title: str | None
    judgment_date: date | None
    court_name: str | None = None
    summary: str | None
    provisions: list
    bench: list
    outcome: str | None
    source_url: str | None


class MatchOut(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    matter_title: str
    matter_number: str
    relevance: float
    signals: dict
    status: str
    is_alert: bool
    comparison: dict | None
    judgment: JudgmentOut
    detected_at: datetime


class MatchStatusIn(BaseModel):
    status: str  # new/reviewed/dismissed

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in {"new", "reviewed", "dismissed"}:
            raise ValueError("Status must be new, reviewed or dismissed")
        return v


# ---- Dashboard ----
class DashStats(BaseModel):
    open_matters: int
    overdue_tasks: int
    hearings_week: int
    new_alerts: int


class DashItem(BaseModel):
    kind: str  # hearing / task
    id: uuid.UUID
    title: str
    at: datetime | None = None
    matter_id: uuid.UUID | None = None
    matter_title: str | None = None
    priority: str | None = None


class DashAlert(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    matter_title: str
    title: str | None = None
    relevance: float


class DashMatter(BaseModel):
    id: uuid.UUID
    title: str
    matter_number: str
    priority: str
    next_hearing: datetime | None = None


class DashboardOut(BaseModel):
    stats: DashStats
    today: list[DashItem]
    overdue: list[DashItem]
    alerts: list[DashAlert]
    matters: list[DashMatter]


# ---- Tasks ----
TASK_PRIORITIES = {"low", "medium", "high", "urgent"}
TASK_STATUSES = {"open", "done", "archived"}


class TaskIn(BaseModel):
    title: str
    description: str | None = None
    matter_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_at: datetime | None = None
    priority: str = "medium"
    kind: str = "task"
    depends_on: list[uuid.UUID] = []

    @field_validator("title")
    @classmethod
    def title_required(cls, v):
        v = v.strip()
        if not v or len(v) > 300:
            raise ValueError("Title is required (max 300 characters)")
        return v

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v):
        if v not in TASK_PRIORITIES:
            raise ValueError("Unknown priority")
        return v

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, v):
        if v not in {"task", "follow_up", "deadline"}:
            raise ValueError("Unknown task kind")
        return v


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assignee_id: uuid.UUID | None = None
    due_at: datetime | None = None
    priority: str | None = None
    status: str | None = None
    depends_on: list[uuid.UUID] | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v):
        if v is not None:
            v = v.strip()
            if not v or len(v) > 300:
                raise ValueError("Title is required (max 300 characters)")
        return v

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v):
        if v is not None and v not in TASK_PRIORITIES:
            raise ValueError("Unknown priority")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in TASK_STATUSES:
            raise ValueError("Unknown status")
        return v


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    matter_id: uuid.UUID | None = None
    matter_title: str | None = None
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    due_at: datetime | None = None
    priority: str
    status: str
    kind: str
    depends_on: list[uuid.UUID] = []
    blocked: bool = False
    created_at: datetime


# ---- Calendar & hearings ----
HEARING_STATUSES = {"scheduled", "held", "adjourned", "cancelled"}


class CalItemOut(BaseModel):
    kind: str  # event / hearing
    id: uuid.UUID
    title: str
    start: datetime
    end: datetime
    location: str | None = None
    matter_id: uuid.UUID | None = None
    matter_title: str | None = None
    status: str
    owner_id: uuid.UUID | None = None
    attendee_ids: list[uuid.UUID] = []
    outcome: str | None = None


class EventIn(BaseModel):
    title: str
    start: datetime
    end: datetime
    location: str | None = None
    matter_id: uuid.UUID | None = None
    attendee_ids: list[uuid.UUID] = []

    @field_validator("title")
    @classmethod
    def title_required(cls, v):
        v = v.strip()
        if not v or len(v) > 300:
            raise ValueError("Title is required (max 300 characters)")
        return v


class EventUpdate(BaseModel):
    title: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    location: str | None = None
    matter_id: uuid.UUID | None = None
    attendee_ids: list[uuid.UUID] | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in {"confirmed", "cancelled"}:
            raise ValueError("Unknown status")
        return v


class HearingIn(BaseModel):
    matter_id: uuid.UUID
    scheduled_at: datetime
    court_room: str | None = None
    purpose: str | None = None
    status: str = "scheduled"
    outcome: str | None = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in HEARING_STATUSES:
            raise ValueError("Unknown hearing status")
        return v


class HearingUpdate(BaseModel):
    scheduled_at: datetime | None = None
    court_room: str | None = None
    purpose: str | None = None
    status: str | None = None
    outcome: str | None = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in HEARING_STATUSES:
            raise ValueError("Unknown hearing status")
        return v


class HearingOut(ORM):
    id: uuid.UUID
    matter_id: uuid.UUID
    matter_title: str | None = None
    scheduled_at: datetime
    court_room: str | None = None
    purpose: str | None = None
    status: str
    outcome: str | None = None
