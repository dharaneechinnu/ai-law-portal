# CLAUDE.md — Project Context (read this first in every new conversation)

## 1. What we are building
**AI Law Firm Intelligence & Matter Management Portal** — a web app for a law firm that combines
matter (case) management with AI. Lawyers manage clients, matters, documents, tasks and hearings, while
AI (a) answers questions about a matter's documents with citations (RAG), (b) watches Indian court data
(eCourts) and flags new judgments/orders relevant to open matters, and (c) runs controlled agents
(daily briefing, research, scheduling, tasks) under a server-side policy and human-approval system.

Status: local-development prototype. No Docker, no cloud. Runs with `uvicorn` and `npm run dev`.
Live status lives in `TRACKER.md` (source of truth for what is done). Run instructions live in `README.md`.

## 2. Product areas (7)
Dashboard (action center) · Matters (10-tab workspace) · Clients · People (lawyers, workload, availability) ·
Tasks & Calendar · Legal Intelligence · Analytics — plus Settings (AI providers, integrations, agents/permissions,
notifications, audit) and Account (profile/preferences).

## 3. Tech stack
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL + **pgvector**, psycopg 3, PyJWT, bcrypt,
  cryptography (encrypts stored API keys), httpx, pypdf, python-docx, APScheduler (briefings/sync),
  LangChain + **LangGraph** (agents, Sprint 4).
- **Frontend:** React 18, Vite 5, TypeScript, React Router 6, TanStack Query 5, Tailwind v4, shadcn/ui (Radix), lucide-react.
  Vite dev server on :5173 proxies `/api` to the backend on :8000. Path alias `@` → `frontend/src`.

## 4. Repo layout
```
backend/app/
  main.py            FastAPI app, routers mounted under /api
  core/              config.py (env settings), db.py (engine/SessionLocal), security.py (JWT, hashing, key encryption)
  models/            org.py, legal.py, work.py, docs.py, ai.py  (UUID PKs, timestamps, FKs, indexes)
  schemas.py         Pydantic request/response models
  api/               auth, clients, matters, documents, ai_settings, health, deps (ROLES, auth dependencies)
  services/          matters, ingest (extract/chunk/embed), rag (retrieve+answer), ai_registry (build providers from DB config)
  providers/         base.py (interfaces), openai_compatible.py
  agents/            empty — LangGraph agents arrive in Sprint 4
  seed.py            python -m app.seed <email> <password> [name]
backend/alembic/     migrations (versions/ is empty until the first autogenerate)
frontend/src/
  app/               App.tsx (routes), Layout.tsx
  features/<area>/   auth, matters, settings done; others are .gitkeep stubs
  services/api.ts    API client · types/index.ts · routes/Placeholder.tsx for unbuilt pages
```

## 5. Architecture rules (do not violate)
1. **Provider interfaces only.** App code depends on `LLMProvider`, `EmbeddingProvider`, `RerankerProvider`,
   `LegalDataProvider`, `CalendarProvider`, `EmailProvider` (`backend/app/providers/base.py`) — never on a vendor SDK directly.
   Vendor-specific logic stays inside its adapter.
2. **No secrets in env or the browser.** LLM, embedding, eCourts, calendar and email credentials are entered in the Settings page,
   stored encrypted in the DB, and never returned to the frontend. `.env` holds only DB URL, secret key, CORS origins,
   storage dir, embedding dim.
3. **The LLM never decides permissions.** A server-side policy engine returns `ALLOWED` / `APPROVAL_REQUIRED` / `DISABLED`
   per action (user role, agent policy, temp overrides, protected resources). Agents call application services only, through
   the policy engine. No privileged action runs from the browser.
4. **Server-side RBAC** on every router. Roles: admin, partner, lawyer, associate, paralegal.
5. **Timeline/audit are written by services, never by the LLM.** Audit log is immutable.
6. **RAG must not guess.** Answer only from retrieved chunks, cite document + page, refuse when unsupported.
7. **Legal AI is analysis, not advice.** Never predict case outcomes; label outputs accordingly.
8. **Nothing invented for external APIs.** eCourts endpoints/auth/field mapping come from user-supplied config and sample
   responses; no hard-coded response formats outside the adapter.
9. **Archive, don't hard-delete** tasks and similar records. Destructive/external agent actions default to approval.
10. Embedding dimension is fixed in the schema (default 768, `EMBEDDING_DIM`); changing it needs a migration.

## 6. Roadmap (full scope, A to Z)
- **Setup — done:** repo, env config, models, provider interfaces, frontend shell.
- **Sprint 1 — Auth + Matter + Document + RAG:** login/JWT, account profile, RBAC, clients, matters (+10-tab workspace),
  case timeline, document upload/extraction (PDF/DOCX/TXT, background task), chunking + embeddings + pgvector + hybrid search,
  matter Q&A with citations.
- **Sprint 2 — eCourts + Legal Intelligence:** `ECourtsProvider` adapter, normalization (Court, LegalCase, Party, Judgment,
  Order, Hearing, LegalProvision), manual + scheduled sync deduped by external ID, matter-to-judgment matching with explainable
  per-signal scores, "my case vs judgment" comparison, legal alerts (reviewed/dismissed).
- **Sprint 3 — Tasks + Calendar + Notifications:** task CRUD (assignee, due, priority, dependencies, archive), calendar &
  hearings behind `CalendarProvider` (local mock first), people & availability, dashboard action center, per-user daily briefing
  (time from profile), de-duplicated notifications.
- **Sprint 4 — LangGraph agents + policy + approval:** policy engine, agent tool registry, agents (Daily Briefing, Matter
  Intelligence, Legal Research, Scheduling, Task) with persisted state, execution modes (Suggest/Approval/Autonomous), human
  approval flow, temporary expiring overrides, kill switch, scheduling flow ("schedule a meeting with X tomorrow"), permission
  demo flow ("delete this task" blocked → admin flips policy → approval/allowed).
- **Sprint 5 — Analytics + Settings + Audit:** model registry & task routing, integration settings with Test Connection,
  agents/permissions UI, notification/retention/API-key settings, audit log, decision-driving analytics only (no decorative charts).

## 7. Current state (update when it changes; details in TRACKER.md)
- Sprint 1 code is written and compiles but **not yet verified end to end** against Postgres + an LLM.
- Built backend: auth (`/login`, `/me` GET/PATCH), clients (list/create/update), matters (list/create/get/patch/timeline),
  documents (upload/list/reprocess/ask), AI provider settings (get/put/test), health.
- Built frontend: login, auth context, protected routes, matters list/create, matter detail (Overview, Timeline, Documents,
  Ask AI), AI settings page. Dashboard/People/Tasks/Legal/Analytics/Account are placeholders; no Clients UI yet.
- Not yet: generated Alembic migration, account profile, RBAC enforcement on all routers, remaining matter tabs, Sprints 2–5.
- Blocked on user: eCourts API details (base URL, auth, endpoints, sample response); choice of first LLM + embedding model;
  confirm pgvector installed.

## 8. How to work in this repo
- Commands: backend `uvicorn app.main:app --reload` (in `backend/`, venv active); frontend `npm run dev` / `npm run build`
  (type-checks with `tsc -b`) in `frontend/`; migrations `alembic revision --autogenerate -m "..."` then `alembic upgrade head`.
- Windows + PowerShell/Git Bash environment.
- Match surrounding code style; keep changes scoped to the task. Add new backend features as model → schema → service → router;
  put business logic in `services/`, not routers.
- After finishing a feature, update `TRACKER.md` (`[x]` done · `[~]` scaffolded · `[ ]` not started) and this file's
  "Current state" if it changed.
- Commit only when asked. Ask before anything destructive or outward-facing.
