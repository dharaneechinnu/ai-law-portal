"""Email over SMTP, against a local throwaway SMTP server (aiosmtpd)."""
import socket
import uuid
from email import message_from_bytes, policy

import pytest
from aiosmtpd.controller import Controller

from conftest import headers


class Inbox:
    def __init__(self):
        self.messages = []

    async def handle_DATA(self, server, session, envelope):
        msg = message_from_bytes(envelope.content, policy=policy.default)
        self.messages.append({"to": envelope.rcpt_tos, "subject": msg["subject"], "body": msg.get_content()})
        return "250 OK"


@pytest.fixture(scope="module")
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


def test_settings_never_return_the_password(client, admin, email_on):
    cfg = client.get("/api/settings/email", headers=headers(admin)).json()
    assert cfg["configured"] and cfg["has_password"] and "password" not in cfg and "s3cret" not in str(cfg)


def test_test_email_goes_to_the_admin(client, admin, email_on):
    assert client.post("/api/settings/email/test", headers=headers(admin)).status_code == 200
    assert email_on.messages[-1]["to"] == ["admin@test.firm"]


def test_invite_link_is_emailed(client, admin, email_on):
    addr = f"new.{uuid.uuid4().hex[:6]}@test.firm"
    r = client.post("/api/admin/users", headers=headers(admin), json={"name": "New Person", "email": addr, "role": "associate"})
    assert r.status_code == 201 and r.json()["emailed"] is True
    msg = email_on.messages[-1]
    assert msg["to"] == [addr] and f"/register?token={r.json()['invite_token']}" in msg["body"]


def test_agent_email_waits_for_approval_then_sends(client, admin, email_on):
    A = headers(admin)
    r = client.post("/api/agents/actions", headers=A, json={"agent_key": "task", "action": "SEND_EMAIL",
                                                           "args": {"to": ["client@example.com"], "subject": "Update", "body": "Hearing moved."}}).json()
    assert r["status"] == "pending_approval" and not email_on.messages
    done = client.post(f"/api/approvals/{r['approval_id']}/approve", headers=A).json()
    assert done["status"] == "approved" and done["result"]["sent_to"] == ["client@example.com"]
    assert email_on.messages[-1]["to"] == ["client@example.com"]


def test_kill_switch_stops_agent_email(client, admin, email_on):
    A = headers(admin)
    client.put("/api/agents/kill-switch", headers=A, json={"on": True})
    try:
        r = client.post("/api/agents/actions", headers=A, json={"agent_key": "task", "action": "SEND_EMAIL",
                                                               "args": {"to": ["x@example.com"], "subject": "s", "body": "b"}}).json()
        assert r["status"] == "blocked" and not email_on.messages
        assert client.get("/api/settings/email", headers=A).json()["configured"]  # kill switch kept the email settings
    finally:
        client.put("/api/agents/kill-switch", headers=A, json={"on": False})
