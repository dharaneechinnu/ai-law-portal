"""Policy engine, approvals, kill switch, overrides, agents, audit and settings (Sprints 4 and 5)."""
import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from sqlalchemy import select, text

from conftest import headers


def act(client, h, action, args, agent="task"):
    return client.post("/api/agents/actions", headers=headers(h), json={"agent_key": agent, "action": action, "args": args}).json()


@pytest.fixture
def task(client, admin, matter):
    return client.post("/api/tasks", headers=headers(admin), json={"title": "Policy task", "matter_id": matter["id"]}).json()


@pytest.fixture(autouse=True)
def defaults(client, admin):
    """Every test starts from the shipped defaults."""
    A = headers(admin)
    client.put("/api/agents/kill-switch", headers=A, json={"on": False})
    client.put("/api/agents/task", headers=A, json={"enabled": True, "mode": "approval"})
    client.put("/api/agents/policies/DELETE_TASK", headers=A, json={"decision": "DISABLED"})
    client.put("/api/agents/policies/CREATE_TASK", headers=A, json={"decision": "APPROVAL_REQUIRED"})
    yield


def test_permission_demo_flow(client, admin, task):
    A = headers(admin)
    assert act(client, admin, "DELETE_TASK", {"task_id": task["id"]})["status"] == "blocked"
    client.put("/api/agents/policies/DELETE_TASK", headers=A, json={"decision": "APPROVAL_REQUIRED"})
    r = act(client, admin, "DELETE_TASK", {"task_id": task["id"]})
    assert r["status"] == "pending_approval"
    done = client.post(f"/api/approvals/{r['approval_id']}/approve", headers=A).json()
    assert done["status"] == "approved" and done["result"]["status"] == "archived" and done["decided_by_name"] == "Test Admin"
    assert client.post(f"/api/approvals/{r['approval_id']}/approve", headers=A).status_code == 409


def test_read_only_runs_and_ask_first_waits(client, admin, matter):
    assert act(client, admin, "SEARCH_MATTERS", {"query": ""}, agent="matter_intel")["status"] == "executed"
    client.put("/api/agents/policies/CREATE_TASK", headers=headers(admin), json={"decision": "ALLOWED"})
    assert act(client, admin, "CREATE_TASK", {"title": "x", "matter_id": matter["id"]})["status"] == "pending_approval"


def test_kill_switch_blocks_changes_and_pending_approvals(client, admin, matter):
    A = headers(admin)
    pending = act(client, admin, "CREATE_TASK", {"title": "later", "matter_id": matter["id"]})
    client.put("/api/agents/kill-switch", headers=A, json={"on": True})
    assert act(client, admin, "CREATE_TASK", {"title": "x"})["status"] == "blocked"
    assert act(client, admin, "SEARCH_MATTERS", {"query": ""}, agent="matter_intel")["status"] == "executed"
    r = client.post(f"/api/approvals/{pending['approval_id']}/approve", headers=A).json()
    assert r["status"] == "rejected" and "kill switch" in json.dumps(r["result"]).lower()


def test_override_expires_and_can_be_revoked(client, admin, task):
    A = headers(admin)
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    assert client.post("/api/agents/overrides", headers=A, json={"action": "DELETE_TASK", "decision": "ALLOWED", "expires_at": past}).status_code == 400
    o = client.post("/api/agents/overrides", headers=A, json={"action": "DELETE_TASK", "agent_key": "task", "decision": "ALLOWED",
                                                             "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}).json()
    assert act(client, admin, "DELETE_TASK", {"task_id": task["id"]})["status"] == "executed"
    client.post(f"/api/agents/overrides/{o['id']}/revoke", headers=A)
    t2 = client.post("/api/tasks", headers=A, json={"title": "again"}).json()
    assert act(client, admin, "DELETE_TASK", {"task_id": t2["id"]})["status"] == "blocked"


def test_access_rules_apply_to_agent_actions(client, admin, task, matter, make_user):
    lawyer = make_user("lawyer")
    r = act(client, lawyer, "COMPLETE_TASK", {"task_id": task["id"]})
    assert r["status"] == "blocked" and r["reason"] == "Task not found"  # nothing about the task is revealed
    assert act(client, lawyer, "CREATE_TASK", {"title": "x", "matter_id": matter["id"]})["status"] == "blocked"
    assert client.get("/api/agents/controls", headers=headers(lawyer)).status_code == 403
    assert act(client, admin, "NOT_A_TOOL", {})["status"] == "blocked"


class FakeLLM:
    """Scripted stand-in for a tool-calling model."""
    model_name = "fake"

    def __init__(self, plan):
        self.plan, self.bound = plan, []

    def bind_tools(self, tools):
        self.bound = [t["function"]["name"] for t in tools]
        return self

    async def ainvoke(self, messages):
        results = [json.loads(m.content) for m in messages if isinstance(m, ToolMessage)]
        step = self.plan(len(results), results)
        if isinstance(step, str):
            return AIMessage(content=step)
        return AIMessage(content="", tool_calls=[{"name": step[0], "args": step[1], "id": f"c{len(results)}"}])


def test_scheduling_agent_flow(client, admin, make_user, db):
    from app.models import User
    from app.services import agent_runtime, agents
    lawyer = make_user("lawyer")
    me = db.scalar(select(User).where(User.email == "admin@test.firm"))
    start = (datetime.now().astimezone() + timedelta(days=1)).replace(hour=11, minute=0, second=0, microsecond=0)

    def plan(n, r):
        if n == 0:
            return ("FIND_PEOPLE", {"query": "Test Lawyer"})
        if n == 1:
            return ("CHECK_AVAILABILITY", {"person_id": lawyer["id"], "start": start.isoformat(), "end": (start + timedelta(minutes=30)).isoformat()})
        if n == 2:
            return ("CREATE_EVENT", {"title": "Agent call", "start": start.isoformat(), "end": (start + timedelta(minutes=30)).isoformat(),
                                     "attendee_ids": [lawyer["id"]]})
        return "Waiting for your approval."

    fake = FakeLLM(plan)
    out = asyncio.run(agents.chat(db, me, "scheduling", "Book a call tomorrow", llm=fake))
    assert set(fake.bound) == set(agents.AGENT_SPECS["scheduling"]["tools"])
    assert [s["status"] for s in out["steps"]] == ["executed", "executed", "pending_approval"]
    res = asyncio.run(agent_runtime.approve(db, me, out["steps"][2]["approval_id"]))
    assert res.result["event"]["title"] == "Agent call"


def test_agent_guard_rails(client, admin, db):
    from fastapi import HTTPException
    from app.models import User
    from app.services import agents
    me = db.scalar(select(User).where(User.email == "admin@test.firm"))
    out = asyncio.run(agents.chat(db, me, "matter_intel", "x", llm=FakeLLM(lambda n, r: ("DELETE_TASK", {"task_id": "x"}) if n == 0 else "ok")))
    assert out["steps"][0]["status"] == "blocked"
    with pytest.raises(HTTPException, match="did not finish"):
        asyncio.run(agents.chat(db, me, "matter_intel", "loop", llm=FakeLLM(lambda n, r: ("SEARCH_MATTERS", {"query": ""}))))
    with pytest.raises(HTTPException, match="AI providers"):
        asyncio.run(agents.chat(db, me, "task", "hi"))


def test_audit_is_append_only_and_searchable(client, admin, db):
    assert client.get("/api/audit", headers=headers(admin), params={"q": "delete task"}).status_code == 200
    for sql in ("UPDATE audit_logs SET action = action", "DELETE FROM audit_logs"):
        with pytest.raises(Exception, match="append-only"):
            db.execute(text(sql))
        db.rollback()


def test_firm_settings_range_checked(client, admin):
    A = headers(admin)
    assert client.put("/api/settings/firm", headers=A, json={"meeting_reminder_minutes": 1}).status_code == 400
    r = client.put("/api/settings/firm", headers=A, json={"legal_alert_threshold": 0.75})
    assert r.status_code == 200 and r.json()["legal_alert_threshold"] == 0.75
    client.put("/api/settings/firm", headers=A, json={"legal_alert_threshold": 0.6})


def test_analytics_scoped(client, admin, make_user):
    assert client.get("/api/analytics?days=30", headers=headers(admin)).json()["firm"]["active_matters"] >= 1
    assert client.get("/api/analytics?days=30", headers=headers(make_user("lawyer"))).json()["firm"]["active_matters"] == 0
    assert client.get("/api/analytics?days=12", headers=headers(admin)).status_code == 400
