"""Email settings and sending. Settings live in firms.settings["email"]; the SMTP password is stored encrypted and
never returned to the browser. Every send is audited."""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models import Firm, User
from app.providers.base import EmailProvider
from app.providers.smtp_email import SmtpEmailProvider
from app.schemas import EmailConfigIn, EmailConfigOut
from app.services import audit

log = logging.getLogger(__name__)


class NotConfigured(Exception):
    pass


def _firm(db: Session) -> Firm | None:
    return db.scalar(select(Firm))


def _cfg(db: Session) -> dict:
    firm = _firm(db)
    return dict((firm.settings or {}).get("email") or {}) if firm else {}


def read_config(db: Session) -> EmailConfigOut:
    c = _cfg(db)
    return EmailConfigOut(configured=bool(c.get("host") and c.get("sender")), host=c.get("host"), port=c.get("port"),
                          security=c.get("security", "starttls"), username=c.get("username"), sender=c.get("sender"),
                          has_password=bool(c.get("password_encrypted")))


def save_config(db: Session, body: EmailConfigIn) -> EmailConfigOut:
    firm = _firm(db)
    if not firm:
        raise NotConfigured("Firm is not set up")
    c = _cfg(db)
    c.update(host=body.host.strip(), port=body.port, security=body.security, username=(body.username or "").strip() or None,
             sender=body.sender.strip())
    if body.password:
        c["password_encrypted"] = encrypt_secret(body.password)
    firm.settings = {**(firm.settings or {}), "email": c}
    db.commit()
    return read_config(db)


def get_provider(db: Session) -> EmailProvider:
    c = _cfg(db)
    if not (c.get("host") and c.get("sender")):
        raise NotConfigured("Email is not set up. An admin must add it in Settings > Email.")
    pw = decrypt_secret(c["password_encrypted"]) if c.get("password_encrypted") else None
    return SmtpEmailProvider(c["host"], int(c.get("port") or 587), c.get("security", "starttls"), c.get("username"), pw,
                             c["sender"])


def is_configured(db: Session) -> bool:
    return read_config(db).configured


async def send(db: Session, to: list[str], subject: str, body: str, *, actor: User | None = None,
               reason: str = "email") -> str:
    """Send through the configured provider and audit it (recipients and subject only, never the body)."""
    message_id = await get_provider(db).send(to, subject, body)
    audit.record(db, action="EMAIL_SENT", user_id=actor.id if actor else None, resource_type=reason, executed=True,
                 result={"to": to, "subject": subject})
    db.commit()
    return message_id


def public_url() -> str:
    return (settings.public_url or settings.cors_origins.split(",")[0]).rstrip("/")


async def send_invite(db: Session, user: User, token: str, actor: User) -> bool:
    """Email a one-time access link. Returns False (and the admin copies the link) if email is off or fails."""
    if not is_configured(db):
        return False
    firm = user.firm.name if user.firm else "your firm"
    link = f"{public_url()}/register?token={token}"
    body = (f"Hello {user.name},\n\n{actor.name} has given you access to {firm}'s portal.\n\n"
            f"Set your password here (the link works once and expires in 7 days):\n{link}\n\n"
            "If you were not expecting this, ignore this email.")
    try:
        await send(db, [user.email], f"Your access to {firm}", body, actor=actor, reason="invite")
        return True
    except Exception:
        log.exception("Invite email to %s failed", user.email)
        return False
