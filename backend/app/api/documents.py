import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import Document, User
from app.schemas import AskIn, AskOut, DocumentOut
from app.services import ai_registry, rag
from app.services.documents import add_document
from app.services.ingest import process_document

router = APIRouter(prefix="/matters/{matter_id}", tags=["documents"])


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(matter_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id, user)
    return db.scalars(select(Document).where(Document.matter_id == matter_id).order_by(Document.created_at.desc())).all()


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(matter_id: uuid.UUID, background: BackgroundTasks, file: UploadFile = File(...),
                          db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id, user)
    doc = add_document(db, user, matter_id, file.filename or "", file.content_type or "", await file.read())
    db.commit()
    background.add_task(process_document, doc.id)
    return doc


@router.post("/documents/{document_id}/reprocess", response_model=DocumentOut)
def reprocess(matter_id: uuid.UUID, document_id: uuid.UUID, background: BackgroundTasks,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_matter_or_404(db, matter_id, user)
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
    get_matter_or_404(db, matter_id, user)
    try:
        return await rag.ask_matter(db, matter_id, body.question)
    except ai_registry.NotConfigured as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI provider error: {e}")
