import httpx
from datetime import datetime, timedelta, timezone
c = httpx.Client(base_url="http://localhost:8000/api", timeout=60)
c.post("/auth/login", json={"email": "admin@firm.com", "password": "Admin@12345"}).raise_for_status()
ok = lambda r: (r.raise_for_status(), r.json())[1]
users = {u["name"]: u for u in ok(c.get("/people"))}
pr = users["Priya Menon"]["id"]
ok(c.post("/admin/users", json={"name": "Arjun Iyer", "email": "arjun@firm.com", "role": "associate", "password": "Passw0rd!x"}))
ok(c.post("/admin/users", json={"name": "Meera Nair", "email": "meera@firm.com", "role": "paralegal", "password": "Passw0rd!x"}))
cl = ok(c.post("/clients", json={"name": "Deccan Builders LLP", "email": "office@deccanbuilders.example", "phone": "+91 80 4110 2200"}))
m3 = ok(c.post("/matters", json={"title": "Deccan Builders v. Sharma", "client_id": cl["id"], "court": "City Civil Court, Bengaluru", "practice_area": "Civil",
     "assigned_lawyer_id": pr, "description": "Recovery suit for unpaid construction dues.", "legal_issues": ["Order 37 CPC", "summary suit"], "priority": "medium"}))
ms = ok(c.get("/matters"))
mid = {m["title"]: m["id"] for m in (ms if isinstance(ms, list) else ms.get("items", []))}
now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
ok(c.post("/tasks", json={"title": "Collect site completion certificates", "matter_id": m3["id"], "assignee_id": pr, "due_at": (now + timedelta(days=2)).isoformat()}))
ok(c.post("/tasks", json={"title": "Index the case file", "matter_id": mid["Rao v. State of Karnataka"], "due_at": (now + timedelta(days=1)).isoformat(), "priority": "low"}))
d = now + timedelta(days=1)
ok(c.post("/calendar/events", json={"title": "Client call: Asha Rao", "start": d.replace(hour=6).isoformat(), "end": d.replace(hour=6, minute=30).isoformat(), "attendee_ids": [pr]}))
ok(c.post("/calendar/events", json={"title": "Team review: GST refund appeal", "start": (now + timedelta(days=3)).replace(hour=9).isoformat(), "end": (now + timedelta(days=3)).replace(hour=10).isoformat(), "attendee_ids": [pr]}))
ok(c.post("/hearings", json={"matter_id": m3["id"], "scheduled_at": (now + timedelta(days=6)).replace(hour=5).isoformat(), "court_room": "Hall 4", "purpose": "Framing of issues"}))
print("ok", list(mid))
