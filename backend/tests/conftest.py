"""Test setup: a fresh `<db>_test` Postgres database is created and migrated for each run, so the working database is
never touched. Requires the Postgres server from backend/.env (with pgvector). Run: `pytest` in backend/."""
import os
import re
import socket
import uuid
from email import message_from_bytes, policy
from pathlib import Path

import psycopg
import pytest
from aiosmtpd.controller import Controller

BACKEND = Path(__file__).resolve().parents[1]


def _test_url() -> str:
    env = (BACKEND / ".env").read_text(encoding="utf-8") if (BACKEND / ".env").exists() else ""
    m = re.search(r"^DATABASE_URL=(.+)$", env, re.M)
    base = os.environ.get("TEST_DATABASE_URL") or (m.group(1).strip() if m else
                                                  "postgresql+psycopg://postgres:password@localhost:5432/ai_law")
    return base if base.rsplit("/", 1)[1].endswith("_test") else base + "_test"


TEST_URL = _test_url()
os.environ["DATABASE_URL"] = TEST_URL  # must be set before the app (and its engine) is imported
os.environ["SCHEDULER_ENABLED"] = "false"


def _recreate_database() -> None:
    server, name = TEST_URL.replace("postgresql+psycopg://", "postgresql://").rsplit("/", 1)
    with psycopg.connect(f"{server}/postgres", autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        conn.execute(f'CREATE DATABASE "{name}"')


@pytest.fixture(scope="session")
def client():
    _recreate_database()
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")

    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        yield c


def auth(c, email: str, password: str) -> dict:
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {_take_session(c, r)}"}


def _take_session(c, r) -> str:
    """Read the session cookie and drop it from the shared client, so each test authenticates explicitly."""
    token = r.cookies["session"]
    c.cookies.clear()
    return token


@pytest.fixture(scope="session")
def admin(client):
    r = client.post("/api/auth/setup", json={"firm_name": "Test Firm", "name": "Test Admin",
                                              "email": "admin@test.firm", "password": "Admin@12345"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {_take_session(client, r)}", "id": r.json()["user"]["id"]}


def headers(h: dict) -> dict:
    return {"Authorization": h["Authorization"]}


@pytest.fixture
def make_user(client, admin):
    def _make(role: str = "lawyer") -> dict:
        email = f"{role}.{uuid.uuid4().hex[:8]}@test.firm"
        r = client.post("/api/admin/users", headers=headers(admin),
                        json={"name": f"Test {role.title()}", "email": email, "role": role, "password": "Passw0rd!x"})
        assert r.status_code == 201, r.text
        h = auth(client, email, "Passw0rd!x")
        return {**h, "id": r.json()["user"]["id"], "email": email}
    return _make


@pytest.fixture
def matter(client, admin):
    """A fresh matter owned (assigned) to the admin."""
    cl = client.post("/api/clients", headers=headers(admin), json={"name": f"Client {uuid.uuid4().hex[:6]}"}).json()
    r = client.post("/api/matters", headers=headers(admin), json={"title": f"Matter {uuid.uuid4().hex[:6]}", "client_id": cl["id"]})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def db():
    from app.core.db import SessionLocal
    s = SessionLocal()
    yield s
    s.close()


class Inbox:
    def __init__(self):
        self.messages = []

    async def handle_DATA(self, server, session, envelope):
        msg = message_from_bytes(envelope.content, policy=policy.default)
        self.messages.append({"to": envelope.rcpt_tos, "subject": msg["subject"],
                              "body": msg.get_body(("plain",)).get_content(),
                              "attachments": {a.get_filename(): a.get_content() for a in msg.iter_attachments()}})
        return "250 OK"


@pytest.fixture(scope="session")
def smtp():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    inbox = Inbox()
    ctl = Controller(inbox, hostname="127.0.0.1", port=port)
    ctl.start()
    yield port, inbox
    ctl.stop()


@pytest.fixture
def email_on(client, admin, smtp):
    port, inbox = smtp
    r = client.put("/api/settings/email", headers=headers(admin), json={
        "host": "127.0.0.1", "port": port, "security": "none", "username": None, "password": "s3cret", "sender": "portal@test.firm"})
    assert r.status_code == 200
    inbox.messages.clear()
    return inbox
