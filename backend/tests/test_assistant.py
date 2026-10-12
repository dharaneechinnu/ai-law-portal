"""Ask AI: chat attachments, the pause-for-approval / resume loop, email attachments and per-agent tool permissions."""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from conftest import headers
from test_ai_controls import FakeLLM

READ_TOOLS = ["GET_MATTER", "LIST_DOCUMENTS", "SEARCH_MATTERS"]


@pytest.fixture(autouse=True)
def defaults(client, admin, monkeypatch):
    from app.services import agent_tools
    monkeypatch.setattr(agent_tools, "process_document", lambda doc_id: None)  # no indexing thread in tests
    A = headers(admin)
    client.put("/api/agents/kill-switch", headers=A, json={"on": False})
    client.put("/api/agents/assistant", headers=A, json={"enabled": True, "mode": "approval"})
    yield
    for action in [*READ_TOOLS, "SEND_EMAIL"]:
        client.delete(f"/api/agents/policies/{action}", headers=A, params={"agent_key": "assistant"})


@pytest.fixture
def me(db):
    from app.models import User
    return db.scalar(select(User).where(User.email == "admin@test.firm"))


@pytest.fixture
def case(client, admin):
    A = headers(admin)
    cl = client.post("/api/clients", headers=A, json={"name": "Asha Rao", "email": "asha@client.example"}).json()
    return client.post("/api/matters", headers=A, json={"title": f"Rao v State {uuid.uuid4().hex[:4]}", "client_id": cl["id"]}).json()


def upload(client, h, name="brief.txt", data=b"Reply brief, draft 2"):
    r = client.post("/api/assistant/uploads", headers=headers(h), files={"file": (name, data, "text/plain")})
    assert r.status_code == 201, r.text
    return r.json()


def test_file_and_email_flow_pauses_for_each_approval(client, admin, case, me, db, email_on):
    A = headers(admin)
    up = upload(client, admin)
    seen = []

    def plan(n, results):
        seen[:] = results
        if n == 0:
            return ("GET_MATTER", {"matter_id": case["id"]})
        if n == 1:
            return ("ATTACH_FILE", {"upload_id": up["id"], "matter_id": case["id"]})
        if n == 2:
            doc_id = results[1]["result"]["document_id"]
            return ("SEND_EMAIL", {"to": [results[0]["result"]["matter"]["client"]["email"]], "subject": "Your reply brief",
                                   "body": "Attached.", "document_ids": [doc_id]})
        return "Filed the brief and emailed Asha."

    from app.services import agents
    out = asyncio.run(agents.chat(db, me, "assistant", "Upload this file to this case and mail it to the client",
                                  llm=FakeLLM(plan), upload_ids=[uuid.UUID(up["id"])], matter_id=uuid.UUID(case["id"])))
    assert out["status"] == "waiting_approval"
    assert [s["status"] for s in out["steps"]] == ["executed", "pending_approval"]
    assert out["steps"][1]["summary"].startswith("File “brief.txt” to ")
    assert not client.get(f"/api/matters/{case['id']}/documents", headers=A).json()  # nothing filed yet

    with pytest.raises(HTTPException, match="Approve or reject"):
        asyncio.run(agents.chat(db, me, "assistant", "hello?", out["execution_id"], llm=FakeLLM(plan)))
    with pytest.raises(HTTPException, match="Still waiting"):
        asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))

    assert client.post(f"/api/approvals/{out['steps'][1]['approval_id']}/approve", headers=A).json()["status"] == "approved"
    docs = client.get(f"/api/matters/{case['id']}/documents", headers=A).json()
    assert [d["filename"] for d in docs] == ["brief.txt"]

    db.expire_all()
    out = asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))
    assert seen[1]["status"] == "executed"  # the model saw the real outcome, not "pending"
    assert out["status"] == "waiting_approval" and out["steps"][0]["action"] == "SEND_EMAIL"
    assert "(1 attachment)" in out["steps"][0]["summary"] and not email_on.messages

    client.post(f"/api/approvals/{out['steps'][0]['approval_id']}/approve", headers=A)
    msg = email_on.messages[-1]
    assert msg["to"] == ["asha@client.example"] and msg["attachments"] == {"brief.txt": "Reply brief, draft 2"}

    db.expire_all()
    out = asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))
    assert out["status"] == "completed" and out["reply"] == "Filed the brief and emailed Asha."


def test_rejected_action_is_reported_to_the_model(client, admin, case, me, db):
    up = upload(client, admin)
    seen = []

    def plan(n, results):
        seen[:] = results
        return ("ATTACH_FILE", {"upload_id": up["id"], "matter_id": case["id"]}) if n == 0 else "Not filed."

    from app.services import agents
    out = asyncio.run(agents.chat(db, me, "assistant", "file it", llm=FakeLLM(plan), upload_ids=[uuid.UUID(up["id"])]))
    client.post(f"/api/approvals/{out['steps'][0]['approval_id']}/reject", headers=headers(admin))
    db.expire_all()
    out = asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))
    assert seen[0]["status"] == "rejected" and out["reply"] == "Not filed."
    assert not client.get(f"/api/matters/{case['id']}/documents", headers=headers(admin)).json()


def test_uploads_are_private_to_their_owner(client, admin, case, make_user, db):
    from app.models import User
    from app.services import agents
    lawyer = make_user("lawyer")
    up = upload(client, admin)
    r = client.post("/api/agents/actions", headers=headers(lawyer), json={
        "agent_key": "assistant", "action": "ATTACH_FILE", "args": {"upload_id": up["id"], "matter_id": case["id"]}}).json()
    assert r["status"] == "blocked" and r["reason"] == "Attached file not found"
    other = db.scalar(select(User).where(User.email == lawyer["email"]))
    with pytest.raises(HTTPException, match="Attached file not found"):
        asyncio.run(agents.chat(db, other, "assistant", "x", llm=FakeLLM(lambda n, r: "ok"), upload_ids=[uuid.UUID(up["id"])]))
    bad = client.post("/api/assistant/uploads", headers=headers(admin), files={"file": ("run.exe", b"MZ", "application/octet-stream")})
    assert bad.status_code == 400


def test_tool_permissions_per_agent_and_in_bulk(client, admin, case):
    A = headers(admin)
    r = client.put("/api/agents/policies", headers=A, json={"actions": READ_TOOLS, "decision": "DISABLED", "agent_key": "assistant"})
    assert r.status_code == 200
    tools = {t["action"]: t for t in client.get("/api/agents/controls", headers=A, params={"agent_key": "assistant"}).json()["tools"]}
    assert tools["GET_MATTER"]["decision"] == "DISABLED" and not tools["GET_MATTER"]["inherited"]
    assert tools["LIST_TASKS"]["inherited"]

    def get_matter(agent):
        return client.post("/api/agents/actions", headers=A, json={
            "agent_key": agent, "action": "GET_MATTER", "args": {"matter_id": case["id"]}}).json()

    assert get_matter("assistant")["status"] == "blocked"
    assert get_matter("matter_intel")["status"] == "executed"  # other agents keep the firm-wide rule

    client.delete("/api/agents/policies/GET_MATTER", headers=A, params={"agent_key": "assistant"})
    assert get_matter("assistant")["status"] == "executed"
    assert client.put("/api/agents/policies", headers=A, json={"actions": ["NOPE"], "decision": "DISABLED"}).status_code == 404
    assert client.put("/api/agents/policies/GET_MATTER", headers=A,
                      json={"decision": "DISABLED", "agent_key": "nope"}).status_code == 404
