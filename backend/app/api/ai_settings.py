from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.schemas import AIConfigIn, AIConfigOut, ModelRouteIn, ModelRouteOut
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


@router.get("/routes", response_model=list[ModelRouteOut])
def get_routes(db: Session = Depends(get_db)):
    """Which model handles each job. Jobs without their own model use the default chat model."""
    try:
        return ai_registry.read_routes(db)
    except ai_registry.NotConfigured as e:
        raise HTTPException(409, str(e))


@router.put("/routes/{task}", response_model=list[ModelRouteOut])
def put_route(task: str, body: ModelRouteIn, db: Session = Depends(get_db)):
    if task not in ai_registry.ROUTED_TASKS:
        raise HTTPException(404, "Unknown job")
    try:
        ai_registry.save_route(db, task, body.model)
    except ai_registry.NotConfigured as e:
        raise HTTPException(409, str(e))
    return ai_registry.read_routes(db)
