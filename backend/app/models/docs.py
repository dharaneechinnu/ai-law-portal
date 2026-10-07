import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.db import Base, IdMixin, TimestampMixin


class Document(IdMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    matter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("matters.id"), index=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(300))
    mime_type: Mapped[str] = mapped_column(String(100))
    storage_path: Mapped[str] = mapped_column(String(500))
    size_bytes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded/processing/ready/failed
    page_count: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)


class DocumentChunk(IdMixin, Base):
    """Chunks for matter documents AND legal sources (source_type distinguishes them)."""

    __tablename__ = "document_chunks"
    document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    matter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("matters.id"))
    legal_case_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("legal_cases.id"))
    source_type: Mapped[str] = mapped_column(String(30), default="matter_document")
    chunk_index: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    chunk_meta: Mapped[dict] = mapped_column(JSON, default=dict)  # court, date, practice_area...
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dim))
    __table_args__ = (
        Index("ix_chunks_matter", "matter_id"),
        Index("ix_chunks_document", "document_id"),
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_chunks_fts", text("to_tsvector('english', content)"), postgresql_using="gin"),
    )
