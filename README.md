# AI Law Firm Intelligence & Matter Management Portal

Local-development prototype: FastAPI + PostgreSQL (pgvector) backend, React + Vite frontend.
See [TRACKER.md](TRACKER.md) for the full feature list and status, and
[CLAUDE.md](CLAUDE.md) for the complete project context (scope, architecture rules, roadmap).

## Project tracker spreadsheet
[docs/Project-Tracker.xlsx](docs/Project-Tracker.xlsx) tracks every task with status, priority, dependencies, owner and target date.
- **Summary**: live counts and % done per area and per sprint, plus open items needing input.
- **Frontend**, **Backend**, **AI**: one row per task. Change the Status dropdown (Done / In Progress / Not Started / Blocked) and the Summary updates.

[TRACKER.md](TRACKER.md) remains the feature-level view; the spreadsheet is the detailed task list.

### Google Sheets trackers
- [Feature Tracker (FE + BE + AI)](https://docs.google.com/spreadsheets/d/1qH6SFYa37LD5dRy3VkaqZYHzw0c0AJ8RDApE7ve7oms/edit): one row per feature (39), showing Frontend, Backend and AI work with a status for each, plus an overall status.
- [Task Tracker](https://docs.google.com/spreadsheets/d/1VahdEvdO0KcKf6t4uX9FrloDXqiNDcRRYhCYxDMmJZc/edit): the 92 individual FE / BE / AI tasks with priority and dependencies.

## What it does
A law-firm portal that combines matter management (clients, matters, documents, tasks, hearings)
with AI: cited Q&A over matter documents (RAG), eCourts judgment matching and alerts, and
policy-controlled agents (daily briefing, research, scheduling) with human approval.
Sprint 1 is complete: auth and RBAC, account profile, clients, matters with members and a 10-tab workspace, document upload, Ask AI, AI provider settings.

## Prerequisites
- Python 3.11+
- Node 20+
- PostgreSQL 15+ with the `pgvector` extension installed
- An OpenAI-compatible LLM + embedding endpoint (e.g. Ollama, LM Studio, OpenAI) for Ask AI

## 1. Database
```sql
CREATE DATABASE ai_law;
\c ai_law
CREATE EXTENSION IF NOT EXISTS vector;
```

## 2. Backend (http://localhost:8000)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy ..\.env.example .env         # macOS/Linux: cp ../.env.example .env
```
Edit `backend/.env`: set `DATABASE_URL` and `SECRET_KEY`
(generate with `python -c "import secrets;print(secrets.token_urlsafe(48))"`).

Create the schema (the initial migration is in the repo; it also enables the pgvector extension):
```powershell
alembic upgrade head
```

The first admin is created in the browser on first run (see **First use**). For scripted setups you can seed instead:
```powershell
python -m app.seed admin@firm.com "YourPassword" "Admin Name"
```

Run the API:
```powershell
uvicorn app.main:app --reload
```
Check `http://localhost:8000/api/health` (interactive docs at `/docs`).

## 3. Frontend (http://localhost:5173)
```powershell
cd frontend
npm install
npm run dev
```
Vite proxies `/api` to `http://localhost:8000`. To point elsewhere, create `frontend/.env`
with `VITE_API_URL=http://localhost:8000`.

## 4. First use
1. Open http://localhost:5173. On an empty database you are taken to **Register your firm**: enter the firm name and
   create the admin account. (If you seeded an admin, just sign in.)
2. Open **Team & access** (admin only) and add your lawyers and staff. Each gets a one-time invite link (valid 7 days)
   to set their own password at `/register`, or you can give a temporary password. Roles, disabling access and reset
   links are managed from the same screen. Links are copied and sent by the admin; email delivery comes with the email integration.
3. Go to **Settings** and enter the LLM / embedding provider (base URL, model, API key), then use Test.
4. Create a client and a matter under **Matters**, upload a PDF/DOCX/TXT in the Documents tab,
   then ask questions in the **Ask AI** tab.

## Configuration
LLM, embedding and eCourts credentials are entered in the Settings page and stored
encrypted in the database. They are never sent to the browser. Only DB, secret key,
CORS origins, storage dir and embedding dimension (default 768) come from `.env`.

## Project status (summary)
| Area | Done | Pending |
|---|---|---|
| Setup | Repo layout, env config, DB models, provider interfaces, frontend shell, initial Alembic migration | — |
| Sprint 1 | Auth/RBAC, account profile, clients, matters + members, documents, RAG, AI provider settings (verified E2E on Postgres + pgvector with a stub model endpoint) | Try a real LLM; matter tabs for later sprints are placeholders |
| Sprints 2–5 | — | eCourts, tasks/calendar, agents/policy/approvals, analytics, audit |
