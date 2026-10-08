"""Firm-wide settings an admin can change (stored in firms.settings). Each has a default and an allowed range."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Firm

# key: (default, min, max, type)
SPECS: dict[str, tuple[float, float, float, type]] = {
    "legal_alert_threshold": (0.6, 0.3, 0.95, float),   # match relevance that becomes an alert
    "hearing_reminder_hours": (24, 1, 168, int),
    "meeting_reminder_minutes": (15, 5, 120, int),
    "task_due_reminder_hours": (24, 1, 168, int),
    "approval_expiry_days": (7, 1, 30, int),
}


def get(db: Session, key: str):
    default, lo, hi, kind = SPECS[key]
    firm = db.scalar(select(Firm))
    value = (firm.settings or {}).get(key) if firm else None
    try:
        value = kind(value)
    except (TypeError, ValueError):
        return kind(default)
    return value if lo <= value <= hi else kind(default)


def read_all(db: Session) -> dict:
    return {k: get(db, k) for k in SPECS}


def save(db: Session, values: dict) -> dict:
    """Validate and store the given keys; other firm settings (e.g. the kill switch) are left alone."""
    firm = db.scalar(select(Firm))
    if not firm:
        raise ValueError("Firm is not set up")
    clean = {}
    for key, raw in values.items():
        if key not in SPECS or raw is None:
            continue
        _, lo, hi, kind = SPECS[key]
        value = kind(raw)
        if not lo <= value <= hi:
            raise ValueError(f"{key} must be between {lo:g} and {hi:g}")
        clean[key] = value
    firm.settings = {**(firm.settings or {}), **clean}
    return read_all(db)
