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

- [x] **Auth & sessions** — Email/password login with JWT; `/api/auth/login` and `/me`.
      Branded, animated sign-in, invite-activation and first-run setup screens (desktop and mobile).
- [x] **Firm setup & user access (admin)** — First-run `/setup` registers the firm and its first admin (refused once any user exists).
      Admin "Team & access" panel creates logins (one-time invite link valid 7 days, or temporary password), changes roles,
      disables/enables access and issues reset links. Admins cannot remove their own admin access; the firm keeps one active admin.
      Invite tokens are stored hashed. Links are copied by the admin; email delivery waits for the email integration.
      Passwords are hashed server-side.
- [x] **Account profile** — Name, role, designation, practice area, time zone, working hours, notification prefs, briefing time, AI prefs.
      Editable by the user; role changes are admin-only.
- [x] **RBAC** — Roles: Admin, Partner, Lawyer, Associate, Paralegal; permission checks as FastAPI dependencies.
      Enforced on the server for every router.
- [x] **Case access control** — Admins see every matter; partners see every matter except restricted ones they are not on;
      lawyers, associates and paralegals see only matters they are assigned to or members of. Applied server-side to matters, members,
      timeline, documents, Q&A and legal matches/alerts; hidden matters return 404. Only an admin, partner or the assigned lawyer can
      change members or the Restricted flag.
- [x] **Clients** — Create/list/edit clients with contact details.
      Linked to matters.
- [x] **Matters** — Full matter record (case no., court, jurisdiction, practice area, lawyer, status, priority, dates, legal issues).
      Includes matter members (add/remove, timeline-logged) and the 10-tab workspace UI; Tasks, Hearings, Legal Intelligence, Communications and AI Activity tabs are placeholders until Sprints 2-4.
- [x] **Case timeline** — Chronological, DB-backed event feed per matter (created, doc uploaded, task done, judgment detected, AI approved…).
      Written by services, never by the LLM.
- [x] **Document upload & extraction** — Upload PDF/DOCX/TXT, store the file locally, keep metadata in Postgres, extract text per page.
      Processing runs as a FastAPI background task.
- [x] **Chunking + embeddings + pgvector** — Clean and chunk text, embed through the configured `EmbeddingProvider`, store vectors with doc/page/matter metadata.
      Postgres full-text index supports hybrid search.
- [x] **Matter Q&A (RAG)** — Retrieve top chunks, send only those to the LLM, return an answer with document/page citations.
      Refuses to guess when no source supports an answer.

## Sprint 2 — eCourts + Legal Intelligence

- [x] **eCourts provider adapter** — `ECourtsProvider` implements `LegalDataProvider` (`providers/ecourts.py`). Base URL, API key, auth style
      (header + prefix, or query param), endpoint templates and field mapping are all entered in Settings → Legal data; key stored encrypted.
      No response format is hard-coded. Tested against a local mock only; real eCourts endpoints/mapping still to be entered and tried.
- [x] **Legal data normalization** — Mapped responses become Court, LegalCase, Party and Judgment (with `kind` judgment/order) rows.
      Stores provider + external IDs + source URL so providers can be swapped.
- [~] **Legal data sync** — Manual fetch from the Legal Intelligence page (new judgments by filters, or one case + its orders), deduplicated by
      external ID; new items are chunked and embedded. Scheduled sync not built yet (decision deferred).
- [x] **Matter-to-judgment matching** — Score from semantic similarity, provisions, facts, court/jurisdiction, case type and recency.
      Every match stores its per-signal breakdown; missing signals are left out, not guessed.
- [x] **Case comparison** — "My case vs judgment" report: same, different, potential impact, recommended review.
      Prompted to never predict outcomes; labelled as analysis, not legal advice.
- [x] **Legal alerts** — Matches at or above the firm's alert threshold (default 0.6) are alerts on the Legal Intelligence page and the matter's
      Legal Intelligence tab, and are logged to the matter timeline. Lawyers mark them reviewed/dismissed. Dashboard card waits for Sprint 3.

## Sprint 3 — Tasks + Calendar + Notifications

- [x] **Tasks** — CRUD with assignee, due date, priority, matter link, dependencies, and archive instead of hard delete.
      Task events feed the matter timeline. `/api/tasks` (list/create/patch; no delete), `services/tasks.py` (access rule, dependency
      loop check, "finish dependencies first"); `/tasks` page (Mine/Everyone) and the matter Tasks tab. Not yet run against a live DB.
- [x] **Calendar & hearings** — Calendar events and hearings per matter/user behind `CalendarProvider`.
      Ships with a local mock provider; Google/Outlook slot in later. `LocalCalendarProvider`, `/api/calendar` (range query,
      create/edit/cancel events; organiser-only edits), `/api/hearings` (list/create/update; keeps `matters.next_hearing` current,
      logs to timeline). `/calendar` week view and the matter Hearings tab. Month/day views not built. Not yet run against a live DB.
- [x] **People & availability** — Lawyer list/create/edit/view with practice areas, workload, and free/busy from calendar plus working hours.
      Exposed as a service so agents can ask "is X free?".
      Built: `/people` directory (search, practice-area filter, live free/busy/off status, workload) with profile drawer;
      `services/people.py` (`is_free`, `busy_slots`, default Mon–Fri 09:00–18:00) and `/api/people/{id}/availability`.
      Colleagues see "Busy", not meeting titles. Create/edit stays in Team & access. Not yet run against a live DB.
- [~] **Dashboard action center** — "What do I need to do today": due/overdue tasks, hearings, meetings, follow-ups, docs needing action, AI alerts.
      No decorative charts. Built: `/api/dashboard` (counts, today, overdue, legal alerts, active matters; filtered by case access) and a
      drag-and-drop dashboard (reorder, resize, hide; layout saved per user in `users.dashboard_layout`). Pending: meetings, follow-ups,
      documents needing action, approvals and briefing cards; task and hearing data appear once those features exist.
- [x] **Daily briefing** — Per-user configurable time; a scheduler triggers the Daily Briefing agent and stores the result.
      Time is read from the user's profile, never hard-coded.
      Built: `briefings` table (one per user per local day), `services/briefing.py` (facts from the dashboard service + calendar;
      the configured LLM only words a 2–3 sentence summary, plain factual summary otherwise), APScheduler job every minute in
      `core/scheduler.py` (`SCHEDULER_ENABLED`), `/api/briefing/today` GET/POST, dashboard card. LangGraph agent version is Sprint 4.
- [x] **Notifications** — Briefing, meeting/hearing/deadline reminders, overdue, new legal development, approval requests.
      De-duplicated and actionable to avoid spam.
      Built: `services/notifications.py` (`notify` with per-user dedupe key and Account preferences), reminders every 5 min
      (hearings 24 h ahead, meetings 15 min ahead, tasks due in 24 h, newly overdue), hooks on task assignment, meeting invites,
      legal alerts and briefing ready; `/api/notifications`; sidebar bell with badge and panel. Approval requests wait for Sprint 4.

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

- [~] **Settings: AI providers** (basic single-provider version delivered in Sprint 1) — Admin picks provider (local OpenAI-compatible, OpenAI, Anthropic, Google, Azure, custom), base URL, model, API key.
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

- [ ] eCourts API: base URL, auth header, endpoint paths and a sample response, to fill in Settings → Legal data (the API key is in hand; nothing is invented).
- [ ] Confirm the pgvector package is installed on your Postgres server (the initial migration runs `CREATE EXTENSION IF NOT EXISTS vector`).
- [ ] Choose first LLM + embedding model once the Settings page exists (embedding dimension must be fixed in the schema; default 768).

> Sprint 1 was verified end to end against Postgres 16 + pgvector: login, RBAC (403 for non-admin on AI settings),
> client/matter CRUD, members, profile validation, upload -> extract -> embed -> hybrid retrieval -> cited answer, timeline.
> The LLM and embedding endpoints used for that run were a local OpenAI-compatible stub; try a real model from the Settings page.
> Clients and Account pages are in the sidebar. Role changes remain admin-only (user-management UI comes later).
