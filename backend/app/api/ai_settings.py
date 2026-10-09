from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import User
from app.schemas import AIConfigIn, AIConfigOut, AIModelsIn, AITestOut, ModelRouteIn, ModelRouteOut
from app.services import ai_catalog, ai_registry, audit

router = APIRouter(prefix="/settings/ai", tags=["settings"], dependencies=[Depends(require_roles("admin"))])


@router.get("/providers")
def providers():
    """Every supported provider and the fields it needs. Built into the Settings page."""
    return [ai_catalog.public(p) for p in ai_catalog.PROVIDERS]


@router.get("", response_model=AIConfigOut)
def get_config(db: Session = Depends(get_db)):
    return ai_registry.read_config(db)


@router.put("", response_model=AIConfigOut)
def put_config(body: AIConfigIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        ai_registry.save_config(db, body)
    except (ai_registry.BadConfig, KeyError) as e:
        db.rollback()
        raise HTTPException(400, str(e).strip("'\""))
    audit.record(db, action="AI_PROVIDER_UPDATED", user_id=user.id, resource_type="settings", executed=True,
                 result={"chat": f"{body.chat.kind}:{body.chat.model}",
                         "embedding": f"{body.chat.kind if body.embedding.same_as_chat else body.embedding.kind}:"
                                      f"{body.embedding.model}"})
    db.commit()
    return ai_registry.read_config(db)


@router.post("/models")
async def list_models(body: AIModelsIn, db: Session = Depends(get_db)):
    """Live model list from the provider, using the form's values (empty secrets fall back to the saved ones)."""
    try:
        return {"models": await ai_registry.models_for(db, body)}
    except (ai_registry.BadConfig, KeyError) as e:
        raise HTTPException(400, str(e).strip("'\""))
    except Exception as e:
        raise HTTPException(400, f"Couldn't load models: {ai_registry._short(e)}")


@router.post("/test", response_model=AITestOut)
async def test_config(body: AIConfigIn | None = Body(default=None), db: Session = Depends(get_db)):
    """Real chat + embedding calls. With a body, tests the form before saving; without, tests the saved settings."""
    return await ai_registry.test(db, body)


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
