import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.matters import get_matter_or_404
from app.core.config import settings
from app.core.db import get_db
from app.models import Document, User
from app.schemas import AskIn, AskOut, DocumentOut
from app.services import ai_registry, rag
from app.services.ingest import process_document
from app.services.matters import add_timeline

router = APIRouter(prefix="/matters/{matter_id}", tags=["documents"])

ALLOWED = {".pdf", ".docx", ".txt"}
MAX_BYTES = 50 * 1024 * 1024


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id)
    return db.scalars(select(Document).where(Document.matter_id == matter_id).order_by(Document.created_at.desc())).all()


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(matter_id: uuid.UUID, background: BackgroundTasks, file: UploadFile = File(...),
                          db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED))}")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 50 MB)")
    doc_id = uuid.uuid4()
    folder = Path(settings.storage_dir) / str(matter_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{doc_id}{suffix}"  # stored under a generated name; never trust the client filename on disk
    path.write_bytes(data)
    doc = Document(id=doc_id, matter_id=matter_id, uploaded_by=user.id, filename=Path(file.filename).name,
                   mime_type=file.content_type or "application/octet-stream", storage_path=str(path),
                   size_bytes=len(data))
    db.add(doc)
    add_timeline(db, matter_id, "document_uploaded", f"Document uploaded: {doc.filename}", user.id,
                 {"document_id": str(doc_id)})
    db.commit()
    background.add_task(process_document, doc_id)
    return doc


@router.post("/documents/{document_id}/reprocess", response_model=DocumentOut)
def reprocess(matter_id: uuid.UUID, document_id: uuid.UUID, background: BackgroundTasks,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.get(Document, document_id)
    if not doc or doc.matter_id != matter_id:
        raise HTTPException(404, "Document not found")
    doc.status = "uploaded"
    db.commit()
    background.add_task(process_document, doc.id)
    return doc


@router.post("/ask", response_model=AskOut)
async def ask(matter_id: uuid.UUID, body: AskIn, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id)
    try:
        return await rag.ask_matter(db, matter_id, body.question)
    except ai_registry.NotConfigured as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI provider error: {e}")
