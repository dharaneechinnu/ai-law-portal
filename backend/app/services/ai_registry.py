"""Model registry: resolves the configured LLM / embedding provider from DB settings (admin-editable)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decrypt_secret, encrypt_secret
from app.models import AIModel, AIModelRoute, AIProvider
from app.providers.base import EmbeddingProvider, LLMProvider
from app.providers.openai_compatible import OpenAICompatibleEmbeddings, OpenAICompatibleLLM
from app.schemas import AIConfigIn, AIConfigOut

OPENAI_LIKE = {"openai_compatible", "openai", "azure_openai"}


class NotConfigured(Exception):
    pass


def _route(db: Session, task: str) -> tuple[AIProvider, AIModel]:
    route = db.scalar(select(AIModelRoute).where(AIModelRoute.task == task))
    if not route:
        raise NotConfigured("AI provider not configured. An admin must set it up in Settings > AI Providers.")
    model = db.get(AIModel, route.model_id)
    return db.get(AIProvider, model.provider_id), model


def _dec(v: str | None) -> str | None:
    return decrypt_secret(v) if v else None


# Jobs an admin can send to a different model. Embeddings stay fixed (the vector size is part of the schema).
ROUTED_TASKS = {
    "qa": "Matter Q&A",
    "summary": "Daily briefing",
    "comparison": "Case comparison",
    "agents": "AI agents (needs tool calling)",
}


def get_llm(db: Session, task: str = "chat") -> LLMProvider:
    """Model routed to `task`, or the default chat model when the task has no route of its own."""
    try:
        provider, model = _route(db, task)
    except NotConfigured:
        if task == "chat":
            raise
        provider, model = _route(db, "chat")
    if provider.kind not in OPENAI_LIKE:
        raise NotConfigured(f"Provider kind '{provider.kind}' is not implemented yet")
    return OpenAICompatibleLLM(provider.base_url, _dec(provider.api_key_encrypted), model.model_name)


def get_embedder(db: Session) -> EmbeddingProvider:
    provider, model = _route(db, "embedding")
    if provider.kind not in OPENAI_LIKE:
        raise NotConfigured(f"Provider kind '{provider.kind}' is not implemented yet")
    extra = provider.extra or {}
    return OpenAICompatibleEmbeddings(
        extra.get("embedding_base_url") or provider.base_url,
        _dec(extra.get("embedding_api_key_encrypted")) or _dec(provider.api_key_encrypted),
        model.model_name,
    )


def read_config(db: Session) -> AIConfigOut:
    try:
        provider, chat = _route(db, "chat")
        _, emb = _route(db, "embedding")
    except NotConfigured:
        return AIConfigOut(configured=False)
    extra = provider.extra or {}
    return AIConfigOut(
        configured=True, kind=provider.kind, base_url=provider.base_url, chat_model=chat.model_name,
        embedding_model=emb.model_name, embedding_base_url=extra.get("embedding_base_url"),
        has_api_key=bool(provider.api_key_encrypted),
        has_embedding_api_key=bool(extra.get("embedding_api_key_encrypted")),
    )


def save_config(db: Session, cfg: AIConfigIn) -> None:
    """Single-provider setup for now; routing per task is extended in Sprint 5."""
    provider = db.scalar(select(AIProvider))
    if not provider:
        provider = AIProvider(kind=cfg.kind, name="default")
        db.add(provider)
    provider.kind, provider.base_url = cfg.kind, cfg.base_url
    if cfg.api_key:
        provider.api_key_encrypted = encrypt_secret(cfg.api_key)
    extra = dict(provider.extra or {})
    extra["embedding_base_url"] = cfg.embedding_base_url
    if cfg.embedding_api_key:
        extra["embedding_api_key_encrypted"] = encrypt_secret(cfg.embedding_api_key)
    provider.extra = extra
    db.flush()
    for task, capability, name in (("chat", "chat", cfg.chat_model), ("embedding", "embedding", cfg.embedding_model)):
        route = db.scalar(select(AIModelRoute).where(AIModelRoute.task == task))
        model = db.get(AIModel, route.model_id) if route else None
        if not model:
            model = AIModel(provider_id=provider.id, model_name=name, capability=capability)
            db.add(model)
            db.flush()
            if route:
                route.model_id = model.id
            else:
                db.add(AIModelRoute(task=task, model_id=model.id))
        model.provider_id, model.model_name = provider.id, name
    db.commit()


def read_routes(db: Session) -> list[dict]:
    _, default = _route(db, "chat")
    out = []
    for task, label in ROUTED_TASKS.items():
        route = db.scalar(select(AIModelRoute).where(AIModelRoute.task == task))
        model = db.get(AIModel, route.model_id) if route else None
        out.append({"task": task, "label": label, "model": model.model_name if model else None,
                    "default_model": default.model_name})
    return out


def save_route(db: Session, task: str, model_name: str | None) -> None:
    """Point a job at a model on the configured provider; an empty name goes back to the default chat model."""
    provider, default = _route(db, "chat")
    route = db.scalar(select(AIModelRoute).where(AIModelRoute.task == task))
    model_name = (model_name or "").strip()
    if not model_name or model_name == default.model_name:  # same as default: just follow the default
        if route:
            db.delete(route)
        db.commit()
        return
    model = db.scalar(select(AIModel).where(AIModel.provider_id == provider.id, AIModel.model_name == model_name,
                                            AIModel.capability == "chat"))
    if not model:
        model = AIModel(provider_id=provider.id, model_name=model_name, capability="chat")
        db.add(model)
        db.flush()
    if route:
        route.model_id = model.id
    else:
        db.add(AIModelRoute(task=task, model_id=model.id))
    db.commit()
