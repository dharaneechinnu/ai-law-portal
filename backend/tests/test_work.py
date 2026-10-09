"""Tasks, hearings, calendar, people, dashboard and notifications (Sprint 3)."""
from datetime import datetime, timedelta, timezone

from conftest import headers

NOW = datetime.now(timezone.utc)


def test_dashboard_layout_saved_and_validated(client, admin):
    A = headers(admin)
    r = client.patch("/api/auth/me", headers=A, json={"dashboard_layout": {"widgets": [{"id": "today", "size": "full", "hidden": False}]}})
    assert r.status_code == 200 and r.json()["dashboard_layout"]["widgets"][0]["id"] == "today"
    assert client.patch("/api/auth/me", headers=A, json={"dashboard_layout": {"widgets": "bad"}}).status_code == 422
    # width/height are kept and clamped; junk values are dropped
    r = client.patch("/api/auth/me", headers=A, json={"dashboard_layout": {"widgets": [
        {"id": "today", "size": "half", "hidden": False, "w": 40, "h": 1},
        {"id": "stats", "size": "full", "hidden": False, "w": "wide", "h": True},
    ]}})
    w = r.json()["dashboard_layout"]["widgets"]
    assert (w[0]["w"], w[0]["h"]) == (12, 2) and "w" not in w[1] and "h" not in w[1]


def test_task_dependencies_loops_and_timeline(client, admin, matter):
    A = headers(admin)
    t1 = client.post("/api/tasks", headers=A, json={"title": "Draft", "matter_id": matter["id"], "assignee_id": admin["id"],
                                                   "due_at": (NOW - timedelta(days=1)).isoformat()}).json()
    t2 = client.post("/api/tasks", headers=A, json={"title": "File", "matter_id": matter["id"], "depends_on": [t1["id"]]}).json()
    assert t2["blocked"] is True
    assert client.patch(f"/api/tasks/{t1['id']}", headers=A, json={"depends_on": [t2["id"]]}).status_code == 400
    assert client.patch(f"/api/tasks/{t2['id']}", headers=A, json={"status": "done"}).status_code == 409
    assert any(i["id"] == t1["id"] for i in client.get("/api/dashboard", headers=A).json()["overdue"])
    assert client.patch(f"/api/tasks/{t1['id']}", headers=A, json={"status": "done"}).status_code == 200
    assert client.patch(f"/api/tasks/{t2['id']}", headers=A, json={"status": "done"}).status_code == 200
    events = [e["event_type"] for e in client.get(f"/api/matters/{matter['id']}/timeline", headers=A).json()]
    assert events.count("task_created") == 2 and events.count("task_done") == 2


def test_lawyer_cannot_see_other_matters_work(client, admin, matter, make_user):
    L = headers(make_user("lawyer"))
    client.post("/api/tasks", headers=headers(admin), json={"title": "Secret", "matter_id": matter["id"]})
    assert client.get(f"/api/tasks?scope=all&status=any&matter_id={matter['id']}", headers=L).status_code == 404
    assert client.get("/api/dashboard", headers=L).json()["stats"]["open_matters"] == 0
    assert client.get(f"/api/audit/matters/{matter['id']}", headers=L).status_code == 404


def test_hearing_keeps_next_hearing_current(client, admin, matter):
    A = headers(admin)
    h = client.post("/api/hearings", headers=A, json={"matter_id": matter["id"], "scheduled_at": (NOW + timedelta(days=2)).isoformat()}).json()
    assert client.get(f"/api/matters/{matter['id']}", headers=A).json()["next_hearing"] is not None
    assert client.patch(f"/api/hearings/{h['id']}", headers=A, json={"status": "adjourned"}).status_code == 200
    assert client.get(f"/api/matters/{matter['id']}", headers=A).json()["next_hearing"] is None


def test_event_invite_availability_and_organiser_only(client, admin, make_user):
    lawyer = make_user("lawyer")
    L = headers(lawyer)
    start = NOW + timedelta(hours=1)
    ev = client.post("/api/calendar/events", headers=headers(admin), json={
        "title": "Strategy", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat(), "attendee_ids": [lawyer["id"]]})
    assert ev.status_code == 201
    week = client.get("/api/calendar", headers=L, params={"start": NOW.isoformat(), "end": (NOW + timedelta(days=2)).isoformat()}).json()
    assert any(i["id"] == ev.json()["id"] for i in week)
    assert client.patch(f"/api/calendar/events/{ev.json()['id']}", headers=L, json={"title": "x"}).status_code == 403
    busy = client.get(f"/api/people/{lawyer['id']}", headers=headers(admin)).json()["busy"]
    assert busy and all(b["title"] in ("Busy", "Hearing") for b in busy)  # colleagues never see meeting titles
    av = client.get(f"/api/people/{lawyer['id']}/availability", headers=headers(admin),
                    params={"start": start.isoformat(), "end": (start + timedelta(minutes=30)).isoformat()}).json()
    assert av["free"] is False
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=L).json()]
    assert "meeting" in kinds


def test_reminders_are_sent_once(client, admin, matter, db):
    from app.services.notifications import send_reminders
    client.post("/api/hearings", headers=headers(admin), json={"matter_id": matter["id"], "scheduled_at": (NOW + timedelta(hours=3)).isoformat()})
    assert send_reminders(db) >= 1
    assert send_reminders(db) == 0


def test_briefing_factual_without_model(client, admin):
    r = client.post("/api/briefing/today", headers=headers(admin))
    assert r.status_code == 200 and r.json()["source"] == "facts" and r.json()["summary"]
