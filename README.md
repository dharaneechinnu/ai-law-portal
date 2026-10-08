# AI Law Firm Intelligence & Matter Management Portal

Local-development prototype: FastAPI + PostgreSQL (pgvector) backend, React + Vite frontend.
See [TRACKER.md](TRACKER.md) for the full feature list and status, and
[CLAUDE.md](CLAUDE.md) for the complete project context (scope, architecture rules, roadmap).

## What it does
A law-firm portal that combines matter management (clients, matters, documents, tasks, hearings)
with AI: cited Q&A over matter documents (RAG), eCourts judgment matching and alerts, and
policy-controlled agents (daily briefing, research, scheduling) with human approval.
Currently a Sprint 1 prototype: auth, matters, clients API, document upload, Ask AI, AI provider settings.

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

Create the schema (the first time there are no migrations yet, so generate one):
```powershell
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Seed roles and the first admin user:
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
1. Open http://localhost:5173 and sign in with the admin you seeded.
2. Go to **Settings** and enter the LLM / embedding provider (base URL, model, API key), then use Test.
3. Create a client and a matter under **Matters**, upload a PDF/DOCX/TXT in the Documents tab,
   then ask questions in the **Ask AI** tab.

## Configuration
LLM, embedding and eCourts credentials are entered in the Settings page and stored
encrypted in the database. They are never sent to the browser. Only DB, secret key,
CORS origins, storage dir and embedding dimension (default 768) come from `.env`.

## Project status (summary)
| Area | Done | Pending |
|---|---|---|
| Setup | Repo layout, env config, DB models, provider interfaces, frontend shell | Generated Alembic migration |
| Sprint 1 | Auth/login, matters, clients, documents, RAG, AI provider settings (code written, E2E unverified) | Account profile, RBAC enforcement, remaining matter tabs |
| Sprints 2–5 | — | eCourts, tasks/calendar, agents/policy/approvals, analytics, audit |
