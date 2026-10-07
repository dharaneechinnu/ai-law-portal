# Feature Tracker

Status: `[x]` done · `[~]` scaffolded (structure exists, logic pending) · `[ ]` not started

## Project Setup

- [x] **Repo structure** — `backend/` (FastAPI) and `frontend/` (React+Vite) with domain-based layout.
      No Docker; runs with `uvicorn` and `npm run dev`.
- [x] **Environment config** — `.env.example` for DB, secret key, storage. LLM/legal-API keys are NOT env-driven; they are set in the Settings page.
- [x] **Database models** — SQLAlchemy models for every entity in the spec (UUID PKs, timestamps, FKs, indexes).
      Alembic is wired up; first migration is generated after `DATABASE_URL` is set.
- [x] **Provider interfaces** — `LLMProvider`, `EmbeddingProvider`, `LegalDataProvider`, `RerankerProvider`, `EmailProvider`, `CalendarProvider`.
      App code depends on these only, never on a vendor.
- [x] **Frontend shell** — Vite + React Router + TanStack Query + Tailwind v4 + shadcn/ui base, with routes for all 7 product areas.

## Sprint 1 — Auth + Matter + Document + RAG

- [ ] **Auth & sessions** — Email/password login with JWT; `/api/auth/login` and `/me`.
      Passwords are hashed server-side.
- [ ] **Account profile** — Name, role, designation, practice area, time zone, working hours, notification prefs, briefing time, AI prefs.
      Editable by the user; role changes are admin-only.
- [ ] **RBAC** — Roles: Admin, Partner, Lawyer, Associate, Paralegal; permission checks as FastAPI dependencies.
      Enforced on the server for every router.
- [ ] **Clients** — Create/list/edit clients with contact details.
      Linked to matters.
- [ ] **Matters** — Full matter record (case no., court, jurisdiction, practice area, lawyer, status, priority, dates, legal issues).
      Includes matter members and the 10-tab workspace UI.
- [ ] **Case timeline** — Chronological, DB-backed event feed per matter (created, doc uploaded, task done, judgment detected, AI approved…).
      Written by services, never by the LLM.
- [ ] **Document upload & extraction** — Upload PDF/DOCX/TXT, store the file locally, keep metadata in Postgres, extract text per page.
      Processing runs as a FastAPI background task.
- [ ] **Chunking + embeddings + pgvector** — Clean and chunk text, embed through the configured `EmbeddingProvider`, store vectors with doc/page/matter metadata.
      Postgres full-text index supports hybrid search.
- [ ] **Matter Q&A (RAG)** — Retrieve top chunks, send only those to the LLM, return an answer with document/page citations.
      Refuses to guess when no source supports an answer.

## Sprint 2 — eCourts + Legal Intelligence

- [ ] **eCourts provider adapter** — `ECourtsProvider` implements `LegalDataProvider`; endpoints, auth and field mapping come from user-supplied config.
      No hard-coded response formats outside the adapter.
- [ ] **Legal data normalization** — Map external responses into Court, LegalCase, Party, Judgment, Order, Hearing, LegalProvision.
      Stores provider + external IDs + source URL so providers can be swapped.
- [ ] **Legal data sync** — Manual and scheduled fetch of new cases/orders/judgments, deduplicated by external ID.
      Each new item gets metadata extraction and embeddings.
- [ ] **Matter-to-judgment matching** — Multi-signal score: semantic similarity, provision match, court/jurisdiction, case type, facts, recency.
      Every score stores its per-signal breakdown so it is explainable.
- [ ] **Case comparison** — "My case vs judgment" report: same, different, potential impact, recommended review.
      Prompted to never predict outcomes; labelled as analysis, not legal advice.
- [ ] **Legal alerts** — High-relevance matches become `LegalDevelopment` alerts on the dashboard and matter Legal Intelligence tab.
      Lawyers can mark them reviewed/dismissed.

## Sprint 3 — Tasks + Calendar + Notifications

- [ ] **Tasks** — CRUD with assignee, due date, priority, matter link, dependencies, and archive instead of hard delete.
      Task events feed the matter timeline.
- [ ] **Calendar & hearings** — Calendar events and hearings per matter/user behind `CalendarProvider`.
      Ships with a local mock provider; Google/Outlook slot in later.
- [ ] **People & availability** — Lawyer list/create/edit/view with practice areas, workload, and free/busy from calendar plus working hours.
      Exposed as a service so agents can ask "is X free?".
- [ ] **Dashboard action center** — "What do I need to do today": due/overdue tasks, hearings, meetings, follow-ups, docs needing action, AI alerts.
      No decorative charts.
- [ ] **Daily briefing** — Per-user configurable time; a scheduler triggers the Daily Briefing agent and stores the result.
      Time is read from the user's profile, never hard-coded.
- [ ] **Notifications** — Briefing, meeting/hearing/deadline reminders, overdue, new legal development, approval requests.
      De-duplicated and actionable to avoid spam.

## Sprint 4 — LangGraph + Agent Tools + Policy + Approval

- [ ] **Policy engine** — Server-side decision per action: `ALLOWED` / `APPROVAL_REQUIRED` / `DISABLED`, checking user role, agent policy, overrides, protected resources.
      The LLM can request an action but never decides permission.
- [ ] **Agent tool registry** — Controlled tools (case, task, calendar, legal search, documents, email) that call application services only.
      Every call is routed through the policy engine first.
- [ ] **LangGraph agents** — Daily Briefing, Matter Intelligence, Legal Research, Scheduling, Task agents with persisted execution state.
      Runs server-side only; no privileged action from the browser.
- [ ] **Execution modes** — Suggest / Approval / Autonomous, defaulting to approval for destructive and external actions.
      Mode is enforced by the policy engine.
- [ ] **Human approval flow** — Pending `ApprovalRequest` with Approve/Reject in the UI; approval re-runs the policy check, executes, then audits.
      Records who approved and when.
- [ ] **Temporary overrides** — Admin grants extra permissions to an agent with an expiry; they revert automatically.
      Expiry is checked at decision time.
- [ ] **Kill switch** — One setting disables all agent mutations and external actions.
      Read-only Q&A can stay on if configured.
- [ ] **Scheduling flow** — "Schedule a meeting with Ayodari tomorrow": find lawyer → check availability/working hours → propose → approval → create event → notify → audit.
- [ ] **Permission demo flow** — "Delete this task" is blocked while DISABLED; after the admin flips the policy it becomes approval-required or allowed and executes.

## Sprint 5 — Analytics + Settings + Providers + Audit

- [ ] **Settings: AI providers** — Admin picks provider (local OpenAI-compatible, OpenAI, Anthropic, Google, Azure, custom), base URL, model, API key.
      Keys are encrypted at rest and never returned to the browser.
- [ ] **Model registry & routing** — Map tasks (summary, research, email, classification, embeddings, rerank) to models.
      Changing a route needs no code change.
- [ ] **Settings: legal data / calendar / email / storage** — Configure integrations and "Test Connection" from the UI.
      Secrets stay backend-only.
- [ ] **Settings: agents & permissions UI** — Per-action policy editor, overrides, kill switch, agent settings.
- [ ] **Settings: notifications, retention, API keys** — Daily briefing, reminders, legal alert thresholds, data retention, API keys.
- [ ] **Audit log** — Immutable record of user, agent, action, resource, policy decision, approval, result, provider.
      Searchable in Settings → Security and per matter.
- [ ] **Analytics** — Firm (matters, overdue, hearings, workload, duration), legal intelligence (judgments, high-impact, reviewed), AI (actions, approved/rejected/blocked, model usage).
      Only metrics that drive decisions.

## Open Items / Needs From You

- [ ] eCourts API: base URL, auth method, endpoints, sample response (needed to build the adapter — nothing is invented).
- [ ] Confirm pgvector extension is installed in your Postgres (`CREATE EXTENSION vector;`).
- [ ] Choose first LLM + embedding model once the Settings page exists (embedding dimension must be fixed in the schema; default 768).
