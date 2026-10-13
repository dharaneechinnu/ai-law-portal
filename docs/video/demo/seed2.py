import httpx, time
from datetime import datetime, timedelta, timezone
c = httpx.Client(base_url="http://localhost:8000/api", timeout=60)
r = c.post("/auth/setup", json={"firm_name": "Rao & Menon Associates", "name": "Dharanee Admin", "email": "admin@firm.com", "password": "Admin@12345"}); r.raise_for_status()
ok = lambda r: (r.raise_for_status(), r.json())[1]
law = ok(c.post("/admin/users", json={"name": "Priya Menon", "email": "priya@firm.com", "role": "lawyer", "password": "Passw0rd!x"}))["user"]
me = ok(c.get("/auth/me"))
c.put("/settings/email", json={"host": "127.0.0.1", "port": 2525, "security": "none", "username": None, "password": None, "sender": "portal@firm.com"}).raise_for_status()
cl = ok(c.post("/clients", json={"name": "Asha Rao", "email": "asha@client.example", "phone": "+91 98450 12345"}))
cl2 = ok(c.post("/clients", json={"name": "Kaveri Textiles Pvt Ltd", "email": "legal@kaveri.example"}))
now = datetime.now(timezone.utc)
m = ok(c.post("/matters", json={"title": "Rao v. State of Karnataka", "client_id": cl["id"], "case_number": "CRL.P. 2291/2026",
    "court": "High Court of Karnataka", "jurisdiction": "Karnataka", "practice_area": "Criminal",
    "description": "Petition to quash an FIR for cheating arising out of a dispute over unpaid invoices between business partners.",
    "legal_issues": ["Section 482 CrPC", "Section 420 IPC", "civil dispute given criminal colour"], "priority": "high"}))
m2 = ok(c.post("/matters", json={"title": "Kaveri Textiles v. Union of India", "client_id": cl2["id"], "court": "High Court of Karnataka",
    "practice_area": "Tax", "description": "GST refund claim rejected by the assessing officer.", "legal_issues": ["GST refund", "Article 226"]}))
doc = "\n".join([
 "IN THE HIGH COURT OF KARNATAKA AT BENGALURU. Criminal Petition No. 2291 of 2026.",
 "Asha Rao, Petitioner, versus State of Karnataka, Respondent.",
 "PETITION UNDER SECTION 482 OF THE CODE OF CRIMINAL PROCEDURE praying to quash FIR No. 118/2026 registered on 14 March 2026 at Jayanagar Police Station for the offence under Section 420 IPC.",
 "The dispute arises from unpaid invoices between business partners and is purely civil in nature. A civil suit for recovery is already pending.",
 "The petitioner seeks an interim stay of all further proceedings. The next hearing on the interim stay application is listed before the Court.",
])
files = {"file": ("Petition - CRL.P 2291-2026.txt", doc.encode(), "text/plain")}
ok(c.post(f"/matters/{m['id']}/documents", files=files))
ok(c.post("/tasks", json={"title": "File reply brief", "matter_id": m["id"], "assignee_id": me["id"], "due_at": (now - timedelta(days=1)).isoformat(), "priority": "high"}))
ok(c.post("/tasks", json={"title": "Review client statement", "matter_id": m["id"], "assignee_id": me["id"], "due_at": (now + timedelta(hours=6)).isoformat()}))
ok(c.post("/tasks", json={"title": "Draft GST refund appeal", "matter_id": m2["id"], "assignee_id": law["id"], "due_at": (now + timedelta(days=3)).isoformat()}))
ok(c.post("/hearings", json={"matter_id": m["id"], "scheduled_at": (now + timedelta(days=1)).replace(hour=5, minute=0).isoformat(), "court_room": "Court Hall 12", "purpose": "Interim stay"}))
c.put("/settings/legal", json={"base_url": "https://ecourts.example", "config": {}, "enabled": True})
time.sleep(2)
print("sync", ok(c.post("/legal/sync", json={"mode": "judgments", "filters": {}})))
al = ok(c.get("/legal/alerts"))
print("alerts", [(a["relevance"], a.get("judgment", {}).get("title") if isinstance(a.get("judgment"), dict) else None) for a in al])
if al: ok(c.post(f"/legal/matches/{al[0]['id']}/compare"))
print(ok(c.post("/briefing/today"))["summary"])
print("MATTER", m["id"])
