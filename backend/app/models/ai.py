import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin


class AIProvider(IdMixin, TimestampMixin, Base):
    """Configured from the Settings page. api_key_encrypted is never sent to the browser."""

    __tablename__ = "ai_providers"
    kind: Mapped[str] = mapped_column(String(40))  # openai_compatible/openai/anthropic/google/azure_openai
    name: Mapped[str] = mapped_column(String(100))
    base_url: Mapped[str | None] = mapped_column(String(500))
    api_key_encrypted: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class AIModel(IdMixin, Base):
    __tablename__ = "ai_models"
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_providers.id", ondelete="CASCADE"))
    model_name: Mapped[str] = mapped_column(String(200))
    capability: Mapped[str] = mapped_column(String(20))  # chat/embedding/rerank
    params: Mapped[dict] = mapped_column(JSON, default=dict)


class AIModelRoute(IdMixin, Base):
    __tablename__ = "ai_model_routes"
    task: Mapped[str] = mapped_column(String(60), unique=True)  # case_summary/legal_research/email_draft/...
    model_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_models.id"))


class Agent(IdMixin, Base):
    __tablename__ = "agents"
    key: Mapped[str] = mapped_column(String(50), unique=True)  # briefing/matter_intel/legal_research/scheduling/task
    name: Mapped[str] = mapped_column(String(100))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    mode: Mapped[str] = mapped_column(String(20), default="approval")  # suggest/approval/autonomous


class AgentTool(IdMixin, Base):
    __tablename__ = "agent_tools"
    action: Mapped[str] = mapped_column(String(60), unique=True)  # e.g. DELETE_TASK
    description: Mapped[str | None] = mapped_column(String(300))
    is_mutation: Mapped[bool] = mapped_column(Boolean, default=False)
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)
    is_destructive: Mapped[bool] = mapped_column(Boolean, default=False)


class AgentPolicy(IdMixin, TimestampMixin, Base):
    """Server-side permission per action: ALLOWED / APPROVAL_REQUIRED / DISABLED. Optional expiry = temp override."""

    __tablename__ = "agent_policies"
    action: Mapped[str] = mapped_column(String(60), index=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"))  # null = all agents
    decision: Mapped[str] = mapped_column(String(20))
    is_override: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class AgentExecution(IdMixin, TimestampMixin, Base):
    __tablename__ = "agent_executions"
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    input: Mapped[str] = mapped_column(Text)
    state: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="running")
    model_used: Mapped[str | None] = mapped_column(String(200))
    tokens_in: Mapped[int | None]
    tokens_out: Mapped[int | None]


class ApprovalRequest(IdMixin, TimestampMixin, Base):
    __tablename__ = "approval_requests"
    execution_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agent_executions.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected/expired
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_approval_status", "status", "user_id"),)


class AuditLog(IdMixin, Base):
    __tablename__ = "audit_logs"
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    agent_key: Mapped[str | None] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(60), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(50))
    resource_id: Mapped[str | None] = mapped_column(String(100))
    matter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("matters.id"), index=True)
    policy_decision: Mapped[str | None] = mapped_column(String(20))
    approved: Mapped[bool | None] = mapped_column(Boolean)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    executed: Mapped[bool | None] = mapped_column(Boolean)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    provider: Mapped[str | None] = mapped_column(String(100))


class AssistantUpload(IdMixin, TimestampMixin, Base):
    """A file attached in the Ask AI chat. It stays private to its uploader until an approved agent action files it
    into a matter (document_id is then set)."""

    __tablename__ = "assistant_uploads"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    mime_type: Mapped[str] = mapped_column(String(100))
    storage_path: Mapped[str] = mapped_column(String(500))
    size_bytes: Mapped[int]
    document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id"))
