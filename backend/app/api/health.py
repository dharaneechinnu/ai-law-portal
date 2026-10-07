from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("select 1"))
    has_vector = db.execute(text("select count(*) from pg_extension where extname='vector'")).scalar()
    return {"status": "ok", "pgvector": bool(has_vector)}
