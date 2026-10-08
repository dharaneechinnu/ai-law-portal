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
