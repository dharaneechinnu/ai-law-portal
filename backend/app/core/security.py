import base64
import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import Response

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": user_id, "exp": exp}, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> str:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])["sub"]


def set_session_cookie(response: Response, user_id: str) -> None:
    """Sign the user in with an HttpOnly session cookie (no Max-Age: it ends with the browser session;
    the JWT inside still expires after access_token_minutes). JavaScript never sees the token."""
    response.set_cookie(
        settings.session_cookie_name, create_access_token(user_id),
        httponly=True, secure=settings.session_cookie_secure, samesite="lax", path="/api",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.session_cookie_name, httponly=True, secure=settings.session_cookie_secure, samesite="lax", path="/api",
    )


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    """Encrypt provider API keys before storing them. Never return these to the frontend."""
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()
