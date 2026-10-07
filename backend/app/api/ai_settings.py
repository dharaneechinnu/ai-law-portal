from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.schemas import AIConfigIn, AIConfigOut
from app.services import ai_registry

router = APIRouter(prefix="/settings/ai", tags=["settings"], dependencies=[Depends(require_roles("admin"))])


@router.get("", response_model=AIConfigOut)
def get_config(db: Session = Depends(get_db)):
    return ai_registry.read_config(db)


@router.put("", response_model=AIConfigOut)
def put_config(body: AIConfigIn, db: Session = Depends(get_db)):
    ai_registry.save_config(db, body)
    return ai_registry.read_config(db)


@router.post("/test")
async def test_config(db: Session = Depends(get_db)):
    """Runs a real chat + embedding call with the saved config."""
    try:
        await ai_registry.get_llm(db).test_connection()
        vec = await ai_registry.get_embedder(db).embed(["test"])
    except Exception as e:
        raise HTTPException(400, f"Connection failed: {e}")
    return {"ok": True, "embedding_dim": len(vec[0])}
