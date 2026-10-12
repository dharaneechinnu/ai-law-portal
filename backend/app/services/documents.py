"""Storing matter documents and files attached in the Ask AI chat. Files are saved under generated names; the client's
filename is kept only as a label."""
import uuid
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AssistantUpload, Document, User
from app.services.matters import add_timeline

ALLOWED = {".pdf", ".docx", ".txt"}
MAX_BYTES = 50 * 1024 * 1024
MAX_EMAIL_BYTES = 20 * 1024 * 1024  # total attachments per email


def check_file(filename: str | None, size: int) -> str:
    """Return the lower-case suffix, or raise if the type or size is not accepted."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED))}")
    if size > MAX_BYTES:
        raise HTTPException(413, "File too large (max 50 MB)")
    return suffix


def add_document(db: Session, user: User, matter_id: uuid.UUID, filename: str, mime_type: str, data: bytes) -> Document:
    """Save a file to the matter, add the timeline entry and flush. The caller commits and queues processing."""
    suffix = check_file(filename, len(data))
    doc_id = uuid.uuid4()
    folder = Path(settings.storage_dir) / str(matter_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{doc_id}{suffix}"
    path.write_bytes(data)
    doc = Document(id=doc_id, matter_id=matter_id, uploaded_by=user.id, filename=Path(filename).name,
                   mime_type=mime_type or "application/octet-stream", storage_path=str(path), size_bytes=len(data))
    db.add(doc)
    add_timeline(db, matter_id, "document_uploaded", f"Document uploaded: {doc.filename}", user.id,
                 {"document_id": str(doc_id)})
    db.flush()
    return doc


def stage_upload(db: Session, user: User, filename: str | None, mime_type: str | None, data: bytes) -> AssistantUpload:
    """Keep a chat attachment aside until an approved action files it into a matter."""
    suffix = check_file(filename, len(data))
    up = AssistantUpload(id=uuid.uuid4(), user_id=user.id, filename=Path(filename or "file").name,
                         mime_type=mime_type or "application/octet-stream", storage_path="", size_bytes=len(data))
    folder = Path(settings.storage_dir) / "_assistant" / str(user.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{up.id}{suffix}"
    path.write_bytes(data)
    up.storage_path = str(path)
    db.add(up)
    db.commit()
    return up


def upload_or_404(db: Session, user: User, upload_id: uuid.UUID) -> AssistantUpload:
    """Only the person who attached a file can use it."""
    up = db.get(AssistantUpload, upload_id)
    if not up or up.user_id != user.id:
        raise HTTPException(404, "Attached file not found")
    return up


def read_bytes(path: str) -> bytes:
    try:
        return Path(path).read_bytes()
    except OSError:
        raise HTTPException(410, "The stored file is missing")
