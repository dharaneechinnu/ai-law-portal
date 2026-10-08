"""Legal data source settings (eCourts): stored encrypted, never returned to the browser."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decrypt_secret, encrypt_secret
from app.models import LegalDataSource
from app.providers.ecourts import PROVIDER, ECourtsProvider, NotConfigured
from app.schemas import LegalSourceIn, LegalSourceOut


def _source(db: Session) -> LegalDataSource | None:
    return db.scalar(select(LegalDataSource).where(LegalDataSource.provider == PROVIDER))


def read_config(db: Session) -> LegalSourceOut:
    src = _source(db)
    if not src:
        return LegalSourceOut(configured=False)
    return LegalSourceOut(configured=bool(src.base_url), base_url=src.base_url, has_api_key=bool(src.api_key_encrypted),
                          config=src.config or {}, enabled=src.enabled, last_synced_at=src.last_synced_at)


def save_config(db: Session, cfg: LegalSourceIn) -> None:
    src = _source(db)
    if not src:
        src = LegalDataSource(provider=PROVIDER)
        db.add(src)
    src.base_url = (cfg.base_url or "").strip() or None
    src.config = cfg.config or {}
    src.enabled = cfg.enabled
    if cfg.api_key:
        src.api_key_encrypted = encrypt_secret(cfg.api_key.strip())
    db.commit()


def get_provider(db: Session) -> ECourtsProvider:
    src = _source(db)
    if not src or not src.base_url:
        raise NotConfigured("eCourts is not configured. An admin must set it up in Settings > Legal data.")
    if not src.enabled:
        raise NotConfigured("eCourts is disabled in Settings > Legal data.")
    key = decrypt_secret(src.api_key_encrypted) if src.api_key_encrypted else None
    return ECourtsProvider(src.base_url, key, src.config or {})
