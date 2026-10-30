"""Every agent tool is wired end to end: asked for in chat -> policy -> approval -> the real change in the portal."""
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from conftest import headers
from test_ai_controls import FakeLLM


@pytest.fixture(autouse=True)
def defaults(client, admin):
    A = headers(admin)
    client.put("/api/agents/kill-switch", headers=A, json={"on": False})
    client.put("/api/agents/assistant", headers=A, json={"enabled": True, "mode": "approval"})
    yield


@pytest.fixture
def me(db):
    from app.models import User
    return db.scalar(select(User).where(User.email == "admin@test.firm"))


def ask(client, h, action, args, agent="assistant"):
    r = client.post("/api/agents/actions", headers=headers(h), json={"agent_key": agent, "action": action, "args": args})
    assert r.status_code == 200, r.text
    return r.json()


def do(client, h, action, args, agent="assistant"):
    """Ask for a change, approve it and return what actually ran."""
    r = ask(client, h, action, args, agent)
    assert r["status"] == "pending_approval", r
    out = client.post(f"/api/approvals/{r['approval_id']}/approve", headers=headers(h)).json()
    assert out["status"] == "approved" and "error" not in out["result"], out
    return out["result"]


def soon(days=1, hour=10):
    return (datetime.now().astimezone() + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)


def test_every_tool_is_registered_and_used_by_an_agent(client, admin):
    from app.services.agent_tools import TOOLS
    from app.services.agents import AGENT_SPECS
    used = {t for spec in AGENT_SPECS.values() for t in spec["tools"]}
    assert used <= set(TOOLS) and set(AGENT_SPECS["assistant"]["tools"]) == set(TOOLS)
    listed = {t["action"] for t in client.get("/api/agents/controls", headers=headers(admin)).json()["tools"]}
    assert listed == set(TOOLS)  # every tool shows up in Settings > AI agents
    for action, tool in TOOLS.items():  # every change needs approval unless an admin says otherwise
        assert tool.default in {"APPROVAL_REQUIRED", "DISABLED"} if tool.is_mutation else tool.default == "ALLOWED", action


def test_chat_changes_a_task_and_moves_then_cancels_a_meeting(client, admin, matter, me, db, make_user):
    from app.services import agents
    A = headers(admin)
    lawyer = make_user("lawyer")
    task = client.post("/api/tasks", headers=A, json={"title": "Draft reply", "matter_id": matter["id"],
                                                      "assignee_id": admin["id"]}).json()
    start = soon()
    event = client.post("/api/calendar/events", headers=A, json={
        "title": "Client call", "start": start.isoformat(), "end": (start + timedelta(minutes=30)).isoformat()}).json()
    new_due = soon(days=3, hour=17)

    def plan(n, r):
        if n == 0:
            return ("LIST_TASKS", {"matter_id": matter["id"]})
        if n == 1:  # the model fills every field; nulls must not wipe the assignee or notes
            return ("UPDATE_TASK", {"task_id": r[0]["result"]["tasks"][0]["id"], "due_at": new_due.isoformat(),
                                    "priority": "high", "assignee_id": None, "description": None})
        if n == 2:
            return ("LIST_CALENDAR", {"start": soon(0, 0).isoformat(), "end": soon(2, 0).isoformat()})
        if n == 3:
            ev = next(i for i in r[2]["result"]["items"] if i["title"] == "Client call")
            return ("UPDATE_EVENT", {"event_id": ev["id"], "start": (start + timedelta(hours=4)).isoformat(),
                                     "end": (start + timedelta(hours=4, minutes=30)).isoformat(),
                                     "attendee_ids": [lawyer["id"]]})
        if n == 4:
            return ("CANCEL_EVENT", {"event_id": event["id"]})
        return "Done: task moved, call moved and then cancelled."

    out = asyncio.run(agents.chat(db, me, "assistant", "Push the draft reply to Friday 5pm, high priority",
                                  llm=FakeLLM(plan), matter_id=uuid.UUID(matter["id"])))
    assert [s["status"] for s in out["steps"]] == ["executed", "pending_approval"]
    assert "Update “Draft reply”: due" in out["steps"][1]["summary"] and "priority high" in out["steps"][1]["summary"]
    client.post(f"/api/approvals/{out['steps'][1]['approval_id']}/approve", headers=A)
    t = client.get("/api/tasks", headers=A, params={"matter_id": matter["id"], "scope": "all"}).json()[0]
    assert t["priority"] == "high" and t["assignee_id"] == admin["id"]
    assert datetime.fromisoformat(t["due_at"]) == new_due

    db.expire_all()
    out = asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))
    assert [s["action"] for s in out["steps"]] == ["LIST_CALENDAR", "UPDATE_EVENT"]
    assert "attendees Test Lawyer" in out["steps"][1]["summary"]
    client.post(f"/api/approvals/{out['steps'][1]['approval_id']}/approve", headers=A)
    invited = client.get("/api/calendar", headers=headers(lawyer), params={
        "start": soon(0, 0).isoformat(), "end": soon(2, 0).isoformat()}).json()
    assert [(i["title"], datetime.fromisoformat(i["start"])) for i in invited] == [("Client call", start + timedelta(hours=4))]

    db.expire_all()
    out = asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))
    assert out["steps"][0]["action"] == "CANCEL_EVENT" and out["steps"][0]["summary"].startswith("Cancel “Client call”")
    client.post(f"/api/approvals/{out['steps'][0]['approval_id']}/approve", headers=A)
    db.expire_all()
    out = asyncio.run(agents.resume(db, me, "assistant", out["execution_id"], llm=FakeLLM(plan)))
    assert out["status"] == "completed" and out["reply"].startswith("Done")
    items = client.get("/api/calendar", headers=A, params={"start": soon(0, 0).isoformat(), "end": soon(2, 0).isoformat()}).json()
    assert next(i for i in items if i["id"] == event["id"])["status"] == "cancelled"  # kept, not erased


def test_update_task_cannot_bypass_complete_or_delete_rules(client, admin, matter):
    task = client.post("/api/tasks", headers=headers(admin), json={"title": "Guarded", "matter_id": matter["id"]}).json()
    for status in ("archived", "done"):
        r = client.post("/api/agents/actions", headers=headers(admin), json={
            "agent_key": "assistant", "action": "UPDATE_TASK", "args": {"task_id": task["id"], "status": status}})
        assert r.status_code == 422
    assert ask(client, admin, "DELETE_TASK", {"task_id": task["id"]})["status"] == "blocked"  # still off by default


def test_clients_matters_members_and_hearings_from_chat(client, admin, make_user):
    A = headers(admin)
    lawyer = make_user("lawyer")
    name = f"Meera {uuid.uuid4().hex[:4]}"
    cl = do(client, admin, "CREATE_CLIENT", {"name": name, "email": "meera@client.example"})["client"]
    found = ask(client, admin, "SEARCH_CLIENTS", {"query": name})
    assert found["status"] == "executed" and [c["id"] for c in found["result"]["clients"]] == [cl["id"]]
    do(client, admin, "UPDATE_CLIENT", {"client_id": cl["id"], "phone": "+91 98400 00000", "email": None})
    c = next(c for c in client.get("/api/clients", headers=A).json() if c["id"] == cl["id"])
    assert c["phone"] == "+91 98400 00000" and c["email"] == "meera@client.example"

    m = do(client, admin, "CREATE_MATTER", {"title": "Meera v Builder", "client_id": cl["id"]})["matter"]
    assert m["number"].startswith("M-")
    do(client, admin, "ADD_MATTER_MEMBER", {"matter_id": m["id"], "user_id": lawyer["id"]})
    assert client.get(f"/api/matters/{m['id']}", headers=headers(lawyer)).status_code == 200

    when = soon(days=10)
    h = do(client, admin, "CREATE_HEARING", {"matter_id": m["id"], "scheduled_at": when.isoformat(), "purpose": "Admission"})
    assert ask(client, admin, "LIST_HEARINGS", {"matter_id": m["id"]})["result"]["hearings"][0]["purpose"] == "Admission"
    assert datetime.fromisoformat(client.get(f"/api/matters/{m['id']}", headers=A).json()["next_hearing"]) == when
    do(client, admin, "UPDATE_HEARING", {"hearing_id": h["hearing"]["id"], "status": "adjourned", "outcome": "Next date awaited"})
    hearing = client.get("/api/hearings", headers=A, params={"matter_id": m["id"]}).json()[0]
    assert (hearing["status"], hearing["outcome"]) == ("adjourned", "Next date awaited")

    do(client, admin, "UPDATE_MATTER", {"matter_id": m["id"], "status": "closed", "title": None})
    after = client.get(f"/api/matters/{m['id']}", headers=A).json()
    assert after["status"] == "closed" and after["title"] == "Meera v Builder"
    assert ask(client, admin, "SEARCH_MATTERS", {"query": "Meera v Builder"})["result"]["matters"] == []
    closed = ask(client, admin, "SEARCH_MATTERS", {"query": "Meera v Builder", "include_closed": True})["result"]["matters"]
    assert [x["status"] for x in closed] == ["closed"]
    events = [e["type"] for e in ask(client, admin, "GET_TIMELINE", {"matter_id": m["id"]})["result"]["timeline"]]
    assert {"matter_created", "member_added", "hearing_scheduled", "hearing_adjourned", "matter_updated"} <= set(events)

    audit = client.get(f"/api/audit/matters/{m['id']}", headers=A).json()
    assert {"UPDATE_HEARING", "UPDATE_MATTER"} <= {a["action"] for a in audit}  # linked to the matter


def test_access_rules_hold_for_the_new_tools(client, admin, matter, make_user):
    lawyer = make_user("lawyer")
    start = soon()
    event = client.post("/api/calendar/events", headers=headers(admin), json={
        "title": "Partners only", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()}).json()
    hearing = client.post("/api/hearings", headers=headers(admin), json={
        "matter_id": matter["id"], "scheduled_at": soon(5).isoformat()}).json()
    blocked = [
        ask(client, lawyer, "CANCEL_EVENT", {"event_id": event["id"]}),
        ask(client, lawyer, "UPDATE_EVENT", {"event_id": event["id"], "title": "Mine now"}),
        ask(client, lawyer, "UPDATE_HEARING", {"hearing_id": hearing["id"], "status": "cancelled"}),
        ask(client, lawyer, "ADD_MATTER_MEMBER", {"matter_id": matter["id"], "user_id": lawyer["id"]}),
        ask(client, lawyer, "UPDATE_MATTER", {"matter_id": matter["id"], "status": "closed"}),
        ask(client, lawyer, "LIST_HEARINGS", {"matter_id": matter["id"]}),
    ]
    assert all(b["status"] == "blocked" for b in blocked), blocked


def test_legal_alerts_can_be_listed_and_reviewed(client, admin, matter, db):
    from app.models import Judgment, LegalDevelopment, MatterLegalMatch
    j = Judgment(provider="test", external_judgment_id=uuid.uuid4().hex, title="State v Rao (2026)",
                 judgment_date=date.today())
    db.add(j)
    db.flush()
    dev = LegalDevelopment(judgment_id=j.id, detected_at=datetime.now(timezone.utc))
    db.add(dev)
    db.flush()
    match = MatterLegalMatch(matter_id=uuid.UUID(matter["id"]), development_id=dev.id, relevance=0.95,
                             signals={"provisions": 1.0})
    db.add(match)
    db.commit()

    alerts = ask(client, admin, "LIST_LEGAL_ALERTS", {"matter_id": matter["id"]})["result"]["alerts"]
    assert [(a["match_id"], a["judgment"]) for a in alerts] == [(str(match.id), "State v Rao (2026)")]
    do(client, admin, "REVIEW_LEGAL_ALERT", {"match_id": str(match.id), "status": "dismissed"}, agent="legal_research")
    assert ask(client, admin, "LIST_LEGAL_ALERTS", {"matter_id": matter["id"]})["result"]["alerts"] == []
    db.refresh(match)
    assert match.status == "dismissed" and str(match.reviewed_by) == admin["id"]


def test_briefing_agent_reads_today(client, admin, me, db):
    from zoneinfo import ZoneInfo
    from app.services import agents
    now = datetime.now(ZoneInfo(me.timezone))  # "today" is the user's own day
    start = now.replace(hour=23, minute=0, second=0, microsecond=0)
    client.post("/api/calendar/events", headers=headers(admin), json={
        "title": "Late review", "start": start.isoformat(), "end": (start + timedelta(minutes=30)).isoformat()})
    seen = []

    def plan(n, r):
        seen[:] = r
        return ("GET_TODAY", {}) if n == 0 else "One meeting today."

    fake = FakeLLM(plan)
    out = asyncio.run(agents.chat(db, me, "briefing", "What's on today?", llm=fake))
    assert "GET_TODAY" in fake.bound and out["steps"][0]["status"] == "executed"
    assert "Late review" in [m["title"] for m in seen[0]["result"]["today"]["meetings"]]
