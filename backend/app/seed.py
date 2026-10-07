"""Seed roles and a first admin. Usage: python -m app.seed admin@firm.com 'password' 'Admin Name'"""
import sys

from sqlalchemy import select

from app.api.deps import ROLES
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Firm, Role, User


def seed(email: str, password: str, name: str) -> None:
    with SessionLocal() as db:
        for r in ROLES:
            if not db.scalar(select(Role).where(Role.name == r)):
                db.add(Role(name=r))
        db.flush()
        firm = db.scalar(select(Firm)) or Firm(name="My Law Firm")
        db.add(firm)
        db.flush()
        if not db.scalar(select(User).where(User.email == email.lower())):
            admin = db.scalar(select(Role).where(Role.name == "admin"))
            db.add(User(firm_id=firm.id, role_id=admin.id, name=name, email=email.lower(),
                        password_hash=hash_password(password), daily_briefing_time="09:05"))
        db.commit()
    print(f"Seeded roles and admin {email}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: python -m app.seed <email> <password> [name]")
    seed(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Admin")
