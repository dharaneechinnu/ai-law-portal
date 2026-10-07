"""Document ingestion: extract text -> clean -> chunk -> embed -> store in pgvector."""
import asyncio
import re
import uuid
from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader
from sqlalchemy import delete

from app.core.config import settings
from app.core.db import SessionLocal
from app.models import Document, DocumentChunk
from app.services import ai_registry
from app.services.matters import add_timeline

CHUNK_CHARS = 1200
OVERLAP = 200
EMBED_BATCH = 32


def extract_pages(path: Path, mime: str) -> list[tuple[int | None, str]]:
    """Returns [(page_number, text)]. DOCX/TXT have no real pages, so page is None."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return [(i + 1, p.extract_text() or "") for i, p in enumerate(PdfReader(str(path)).pages)]
    if suffix == ".docx":
        return [(None, "\n".join(p.text for p in DocxDocument(str(path)).paragraphs))]
    if suffix == ".txt":
        return [(None, path.read_text(encoding="utf-8", errors="replace"))]
    raise ValueError(f"Unsupported file type: {suffix}")


def clean(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def chunk_text(text: str) -> list[str]:
    """Fixed window with overlap, preferring to break at paragraph/sentence boundaries."""
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            window = text[start:end]
            cut = max(window.rfind("\n\n"), window.rfind(". "))
            if cut > CHUNK_CHARS // 2:
                end = start + cut + 1
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= len(text):
            break
        start = max(end - OVERLAP, start + 1)
    return chunks


async def _process(document_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        try:
            doc.status = "processing"
            db.commit()
            pages = extract_pages(Path(doc.storage_path), doc.mime_type)
            doc.page_count = len(pages) if pages and pages[0][0] else None
            pieces: list[tuple[int | None, str]] = []
            for page_no, raw in pages:
                for c in chunk_text(clean(raw)):
                    pieces.append((page_no, c))
            if not pieces:
                raise ValueError("No extractable text (scanned PDF? OCR is not supported yet)")
            embedder = ai_registry.get_embedder(db)
            vectors: list[list[float]] = []
            for i in range(0, len(pieces), EMBED_BATCH):
                vectors += await embedder.embed([p[1] for p in pieces[i : i + EMBED_BATCH]])
            if len(vectors[0]) != settings.embedding_dim:
                raise ValueError(
                    f"Embedding model returns {len(vectors[0])} dims but the database expects "
                    f"{settings.embedding_dim}. Change EMBEDDING_DIM and re-migrate, or pick another model."
                )
            db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
            for idx, ((page_no, content), vec) in enumerate(zip(pieces, vectors)):
                db.add(DocumentChunk(
                    document_id=doc.id, matter_id=doc.matter_id, source_type="matter_document",
                    chunk_index=idx, page_number=page_no, content=content, embedding=vec,
                    chunk_meta={"filename": doc.filename},
                ))
            doc.status, doc.error = "ready", None
            add_timeline(db, doc.matter_id, "document_indexed", f"Document indexed: {doc.filename}",
                         detail={"document_id": str(doc.id), "chunks": len(pieces)})
            db.commit()
        except Exception as e:  # surfaced in the UI instead of failing silently
            db.rollback()
            doc = db.get(Document, document_id)
            doc.status, doc.error = "failed", str(e)[:1000]
            db.commit()


def process_document(document_id: uuid.UUID) -> None:
    """Entry point for FastAPI BackgroundTasks (runs in a worker thread)."""
    asyncio.run(_process(document_id))
