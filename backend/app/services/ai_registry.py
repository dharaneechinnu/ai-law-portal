"""Model registry: resolves the configured LLM / embedding provider from DB settings (admin-editable).

Storage: one `ai_providers` row for chat ("default") and, when embeddings come from somewhere else, a second row
("embedding"). Per row: `kind` (a catalog id), `base_url`, the API key encrypted in `api_key_encrypted`, other fields in
extra["fields"] and other secrets encrypted in extra["secrets"]. Secrets never leave the server."""
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models import AIModel, AIModelRoute, AIProvider
from app.providers.base import EmbeddingProvider, LLMProvider
from app.schemas import (
    AIConfigIn, AIConfigOut, AIConnectionOut, AIEmbeddingOut, AIModelsIn, AITestOut,
)
from app.services import ai_catalog


class NotConfigured(Exception):
    pass


class BadConfig(ValueError):
    pass


@dataclass
class Conn:
    """A provider connection with secrets decrypted, ready to build an adapter."""
    kind: str
    base_url: str | None
    values: dict = field(default_factory=dict)  # every field, secrets included

    def get(self, key: str) -> str | None:
        v = self.values.get(key)
        return v.strip() if isinstance(v, str) and v.strip() else None


# Jobs an admin can send to a different model. Embeddings stay fixed (the vector size is part of the schema).
ROUTED_TASKS = {
    "qa": "Matter Q&A",
    "summary": "Daily briefing",
    "comparison": "Case comparison",
    "agents": "AI agents (needs tool calling)",
}


def _dec(v: str | None) -> str | None:
    return decrypt_secret(v) if v else None


def _route(db: Session, task: str) -> tuple[AIProvider, AIModel]:
    route = db.scalar(select(AIModelRoute).where(AIModelRoute.task == task))
    if not route:
        raise NotConfigured("AI provider not configured. An admin must set it up in Settings > AI providers.")
    model = db.get(AIModel, route.model_id)
    return db.get(AIProvider, model.provider_id), model


def _conn(provider: AIProvider, embedding: bool = False) -> Conn:
    extra = provider.extra or {}
    values = dict(extra.get("fields") or {})
    values.update({k: _dec(v) for k, v in (extra.get("secrets") or {}).items()})
    values["api_key"] = _dec(provider.api_key_encrypted)
    base_url = provider.base_url
    if embedding and extra.get("embedding_base_url"):  # configs saved before separate embedding providers existed
        base_url = extra["embedding_base_url"]
        values["api_key"] = _dec(extra.get("embedding_api_key_encrypted")) or values["api_key"]
    values["base_url"] = base_url
    return Conn(provider.kind, base_url, values)


# ---------- building adapters (vendor code stays inside app/providers) ----------

def _require(c: Conn, *keys: str) -> None:
    p = ai_catalog.get(c.kind)
    labels = {f["key"]: f["label"] for f in p["fields"]}
    missing = [labels.get(k, k) for k in keys if not c.get(k)]
    if missing:
        raise BadConfig(f"{p['name']}: {', '.join(missing)} {'is' if len(missing) == 1 else 'are'} required")


def build_llm(c: Conn, model: str) -> LLMProvider:
    p = ai_catalog.get(c.kind)
    _require(c, *[f["key"] for f in p["fields"] if f.get("required")])
    if p["adapter"] == "anthropic":
        from app.providers.anthropic import AnthropicLLM
        return AnthropicLLM(c.get("api_key"), model)
    if p["adapter"] == "azure":
        from app.providers.azure_openai import AzureOpenAILLM
        return AzureOpenAILLM(c.get("endpoint"), c.get("api_key"), c.get("api_version"), model)
    if p["adapter"] == "bedrock":
        from app.providers.bedrock import BedrockLLM
        return BedrockLLM(c.get("region"), c.get("access_key_id"), c.get("secret_access_key"), model)
    from app.providers.openai_compatible import OpenAICompatibleLLM
    return OpenAICompatibleLLM(c.get("base_url") or p["base_url"], c.get("api_key"), model)


def build_embedder(c: Conn, model: str) -> EmbeddingProvider:
    p = ai_catalog.get(c.kind)
    if not p["embeddings"]:
        raise BadConfig(f"{p['name']} has no embedding models. Choose another provider for embeddings.")
    _require(c, *[f["key"] for f in p["fields"] if f.get("required")])
    dims = settings.embedding_dim if p["dimensions"] else None
    if p["adapter"] == "azure":
        from app.providers.azure_openai import AzureOpenAIEmbeddingsProvider
        return AzureOpenAIEmbeddingsProvider(c.get("endpoint"), c.get("api_key"), c.get("api_version"), model, dims)
    from app.providers.openai_compatible import OpenAICompatibleEmbeddings
    return OpenAICompatibleEmbeddings(c.get("base_url") or p["base_url"], c.get("api_key"), model, dims,
                                      asymmetric=p.get("asymmetric_embeddings", False))


async def list_models(c: Conn) -> list[str]:
    p = ai_catalog.get(c.kind)
    if not p["list_models"]:
        return []
    _require(c, *[f["key"] for f in p["fields"] if f.get("required")])
    if p["adapter"] == "anthropic":
        from app.providers.anthropic import list_models as anthropic_models
        return await anthropic_models(c.get("api_key"))
    if p["adapter"] == "bedrock":
        from app.providers.bedrock import list_models as bedrock_models
        return await bedrock_models(c.get("region"), c.get("access_key_id"), c.get("secret_access_key"))
    from app.providers.openai_compatible import list_models as openai_models
    return await openai_models(c.get("base_url") or p["base_url"], c.get("api_key"))


# ---------- runtime lookups used by the app ----------

def get_llm(db: Session, task: str = "chat") -> LLMProvider:
    """Model routed to `task`, or the default chat model when the task has no route of its own."""
    try:
        provider, model = _route(db, task)
    except NotConfigured:
        if task == "chat":
            raise
        provider, model = _route(db, "chat")
    try:
        return build_llm(_conn(provider), model.model_name)
    except (BadConfig, KeyError) as e:
        raise NotConfigured(str(e)) from e


def get_embedder(db: Session) -> EmbeddingProvider:
    provider, model = _route(db, "embedding")
    try:
        return build_embedder(_conn(provider, embedding=True), model.model_name)
    except (BadConfig, KeyError) as e:
        raise NotConfigured(str(e)) from e


# ---------- reading and saving the admin's settings ----------

def _out(provider: AIProvider, model: str, embedding: bool = False) -> dict:
    p = ai_catalog.get(provider.kind)
    c = _conn(provider, embedding)
    secret = set(ai_catalog.secret_keys(p))
    keys = [f["key"] for f in p["fields"]]
    return dict(kind=p["id"], name=p["name"], model=model,
                fields={k: c.values.get(k) for k in keys if k not in secret},
                saved_secrets=[k for k in keys if k in secret and c.values.get(k)])


def read_config(db: Session) -> AIConfigOut:
    try:
        chat_p, chat = _route(db, "chat")
        emb_p, emb = _route(db, "embedding")
    except NotConfigured:
        return AIConfigOut(configured=False, embedding_dim=settings.embedding_dim)
    legacy_split = emb_p.id == chat_p.id and bool((chat_p.extra or {}).get("embedding_base_url"))
    try:
        return AIConfigOut(
            configured=True, embedding_dim=settings.embedding_dim,
            chat=AIConnectionOut(**_out(chat_p, chat.model_name)),
            embedding=AIEmbeddingOut(**_out(emb_p, emb.model_name, embedding=True),
                                     same_as_chat=emb_p.id == chat_p.id and not legacy_split),
        )
    except KeyError:  # a kind this version does not know: show it as not set up
        return AIConfigOut(configured=False, embedding_dim=settings.embedding_dim)


def _apply(provider: AIProvider, kind: str, fields: dict) -> None:
    """Write a connection onto a provider row. Empty secrets keep the stored value if the kind did not change."""
    p = ai_catalog.get(kind)
    same_kind = ai_catalog.ALIASES.get(provider.kind, provider.kind) == p["id"]
    secret = set(ai_catalog.secret_keys(p))
    extra = dict(provider.extra or {}) if same_kind else {}
    extra.pop("embedding_base_url", None)
    extra.pop("embedding_api_key_encrypted", None)
    plain, secrets = {}, dict(extra.get("secrets") or {})
    if not same_kind:
        provider.api_key_encrypted = None
    for f in p["fields"]:
        k, v = f["key"], (fields.get(f["key"]) or "").strip()
        if k in secret:
            if v and k == "api_key":
                provider.api_key_encrypted = encrypt_secret(v)
            elif v:
                secrets[k] = encrypt_secret(v)
        elif k != "base_url":
            plain[k] = v or f.get("default")
    provider.kind = p["id"]
    provider.base_url = (fields.get("base_url") or "").strip() or p["base_url"] if any(
        f["key"] == "base_url" for f in p["fields"]) else p["base_url"]
    provider.extra = {**extra, "fields": plain, "secrets": secrets}
    # every required field must now have a value (typed now or saved before)
    _require(_conn(provider), *[f["key"] for f in p["fields"] if f.get("required")])


def _model(db: Session, provider: AIProvider, task: str, capability: str, name: str) -> None:
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


def save_config(db: Session, cfg: AIConfigIn) -> None:
    chat_p = ai_catalog.get(cfg.chat.kind)
    if not chat_p["chat"]:
        raise BadConfig(f"{chat_p['name']} cannot be used for chat")
    if cfg.embedding.same_as_chat and not chat_p["embeddings"]:
        raise BadConfig(f"{chat_p['name']} has no embedding models. Choose another provider for embeddings.")
    if not cfg.chat.model.strip() or not cfg.embedding.model.strip():
        raise BadConfig("Choose a chat model and an embedding model")

    rows = {p.name: p for p in db.scalars(select(AIProvider)).all()}
    chat = rows.get("default") or next(iter(rows.values()), None)
    if not chat:
        chat = AIProvider(kind=chat_p["id"], name="default")
        db.add(chat)
    chat.name = "default"
    _apply(chat, cfg.chat.kind, cfg.chat.fields)
    db.flush()
    _model(db, chat, "chat", "chat", cfg.chat.model.strip())

    if cfg.embedding.same_as_chat:
        emb = chat
    else:
        emb_p = ai_catalog.get(cfg.embedding.kind)
        if not emb_p["embeddings"]:
            raise BadConfig(f"{emb_p['name']} has no embedding models")
        emb = rows.get("embedding")
        if not emb:
            emb = AIProvider(kind=emb_p["id"], name="embedding")
            db.add(emb)
        _apply(emb, emb_p["id"], cfg.embedding.fields)
        db.flush()
    _model(db, emb, "embedding", "embedding", cfg.embedding.model.strip())
    # Jobs routed to a model name keep the name but follow the (possibly new) chat provider.
    for task in ROUTED_TASKS:
        route = db.scalar(select(AIModelRoute).where(AIModelRoute.task == task))
        if route:
            db.get(AIModel, route.model_id).provider_id = chat.id
    db.commit()


def _draft(db: Session, kind: str, fields: dict, saved: str | None) -> Conn:
    """A connection from the form, with empty secrets filled from the saved connection of the same kind."""
    p = ai_catalog.get(kind)
    values = {k: v for k, v in fields.items() if v}
    if saved:
        try:
            provider, _ = _route(db, "chat" if saved == "chat" else "embedding")
            if ai_catalog.ALIASES.get(provider.kind, provider.kind) == p["id"]:
                stored = _conn(provider, embedding=saved == "embedding").values
                for k in ai_catalog.secret_keys(p):
                    values.setdefault(k, stored.get(k))
        except NotConfigured:
            pass
    for f in p["fields"]:
        if f.get("default"):
            values.setdefault(f["key"], f["default"])
    return Conn(p["id"], values.get("base_url") or p["base_url"], values)


async def models_for(db: Session, body: AIModelsIn) -> list[str]:
    return await list_models(_draft(db, body.kind, body.fields, body.use_saved))


def _short(e: Exception) -> str:
    msg = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
    return msg[:300]


async def test(db: Session, cfg: AIConfigIn | None) -> AITestOut:
    """Real chat + embedding calls, either with the saved settings or with the form before saving."""
    out = AITestOut(chat_ok=False, embedding_ok=False, expected_dim=settings.embedding_dim)
    try:
        if cfg:
            llm = build_llm(_draft(db, cfg.chat.kind, cfg.chat.fields, "chat"), cfg.chat.model)
        else:
            llm = get_llm(db)
        await llm.test_connection()
        out.chat_ok = True
    except Exception as e:
        out.chat_error = _short(e)
    try:
        if cfg:
            kind, fields = ((cfg.chat.kind, cfg.chat.fields) if cfg.embedding.same_as_chat
                            else (cfg.embedding.kind, cfg.embedding.fields))
            emb = build_embedder(_draft(db, kind, fields, "chat" if cfg.embedding.same_as_chat else "embedding"),
                                 cfg.embedding.model)
        else:
            emb = get_embedder(db)
        vec = await emb.embed(["test"])
        out.embedding_dim = len(vec[0])
        out.embedding_ok = out.embedding_dim == settings.embedding_dim
        if not out.embedding_ok:
            out.embedding_error = (f"This model gives {out.embedding_dim} numbers per text; the database expects "
                                   f"{settings.embedding_dim}. Pick a {settings.embedding_dim}-size embedding model.")
    except Exception as e:
        out.embedding_error = _short(e)
    return out


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
