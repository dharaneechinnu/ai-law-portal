"""Capture every app screen at 2x pixel density (2880x1800) for the README and the product video.
Needs the demo server (demo_server.py) on :8000, Vite on :5173, seed2.py + seed3.py already run.
Usage: python capture_all.py <matter id printed by seed2.py>   -> docs/video/assets/shots/*.png"""
import glob, sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import httpx
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
S, MATTER = str(HERE), sys.argv[1]
O, U = str(HERE.parent / "assets" / "shots"), "http://localhost:5173"
__import__("os").makedirs(O, exist_ok=True)

with sync_playwright() as p:
    exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")
    b = p.chromium.launch(executable_path=exe[0]) if exe else p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pg = ctx.new_page()
    def shot(name, wait=1500, **kw):
        pg.wait_for_timeout(wait); pg.screenshot(path=f"{O}/{name}.png", **kw); print("shot", name)

    pg.goto(f"{U}/login"); shot("login", 1800)
    pg.get_by_label("Email").fill("admin@firm.com"); pg.get_by_label("Password", exact=True).fill("Admin@12345")
    pg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(2500)
    shot("dashboard")
    for path, name in [("/matters", "matters"), (f"/matters/{MATTER}", "matter-overview"), ("/clients", "clients"),
                       ("/people", "people"), ("/tasks", "tasks"), ("/calendar", "calendar"), ("/legal", "legal-intelligence"),
                       ("/settings", "ai-providers")]:
        pg.goto(U + path); shot(name)
    pg.goto(f"{U}/matters/{MATTER}"); pg.wait_for_timeout(1500)
    pg.get_by_role("tab", name="Documents", exact=True).click(); shot("matter-documents")
    pg.get_by_role("tab", name="Timeline", exact=True).click(); shot("matter-timeline")
    pg.get_by_role("tab", name="Ask AI", exact=True).click(); pg.wait_for_timeout(800)
    pg.get_by_label("Question").fill("What does the petition ask for and what are the key dates?")
    pg.get_by_role("button", name="Ask", exact=True).click(); shot("matter-ask-ai", 2500)
    pg.get_by_role("tab", name="Legal Intelligence", exact=True).click(); pg.wait_for_timeout(1200)
    if pg.get_by_role("button", name="Show comparison").count():
        pg.get_by_role("button", name="Show comparison").first.click()
    shot("matter-legal-match", full_page=True)
    pg.keyboard.press("Control+k"); shot("command-palette", 1200); pg.keyboard.press("Escape")

    # Ask AI assistant: file + email, approving both steps in the chat
    pg.goto(f"{U}/matters/{MATTER}"); pg.wait_for_timeout(1500)
    pg.get_by_label("Open assistant").click(); pg.wait_for_timeout(800)
    pg.locator('input[type=file][accept=".pdf,.docx,.txt"]').set_input_files(f"{S}/Reply brief - draft 2.txt"); pg.wait_for_timeout(800)
    pg.get_by_label("Message").fill("Upload this file for this case and email it to the client")
    pg.get_by_label("Send").click(); pg.get_by_role("button", name="Approve").first.wait_for(timeout=15000)
    shot("assistant-1-approval", 900)
    pg.get_by_role("button", name="Approve").first.click(); pg.get_by_text("Send email", exact=True).wait_for(timeout=15000)
    shot("assistant-2-email", 900)
    pg.get_by_role("button", name="Approve").last.click(); pg.get_by_text("emailed it to").wait_for(timeout=15000)
    shot("assistant-3-done", 900)
    pg.get_by_label("Close assistant").click()

    # two actions waiting for approval
    c = httpx.Client(base_url="http://localhost:8000/api")
    c.post("/auth/login", json={"email": "admin@firm.com", "password": "Admin@12345"}).raise_for_status()
    due = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    c.post("/agents/actions", json={"agent_key": "task", "action": "CREATE_TASK", "args": {"title": "Prepare list of dates for the stay hearing", "matter_id": MATTER, "due_at": due, "priority": "high"}})
    c.post("/agents/actions", json={"agent_key": "assistant", "action": "SEND_EMAIL", "args": {"to": ["asha@client.example"], "subject": "Hearing tomorrow at 10:30", "body": "Dear Asha, a reminder of tomorrow's hearing."}})
    pg.goto(f"{U}/approvals"); shot("approvals", 1800)
    pg.goto(U + "/"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Notifications").first.click(); shot("notifications")
    pg.keyboard.press("Escape")
    pg.goto(f"{U}/settings?tab=audit"); shot("audit-log")

    # long pages: tall viewport, then clip the part that matters
    tall = ctx.new_page(); tall.set_viewport_size({"width": 1440, "height": 2100})
    tall.goto(f"{U}/settings?tab=agents"); tall.wait_for_timeout(2500)
    tall.screenshot(path=f"{O}/tool-permissions.png", clip={"x": 330, "y": 790, "width": 1110, "height": 1000}); print("shot tool-permissions")
    tall.goto(f"{U}/analytics"); tall.wait_for_timeout(2500)
    tall.screenshot(path=f"{O}/analytics.png", clip={"x": 0, "y": 640, "width": 1440, "height": 600}); print("shot analytics")
    b.close()
