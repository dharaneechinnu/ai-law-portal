---
name: backend-maintainer
description: Maintain the FastAPI backend in one pass - find duplicated functions, schemas and logic, dead code and logic sitting in routers, fix them with tests in ONE backend pull request, and run a security audit whose findings are filed as GitHub issues (one per finding, de-duplicated). Use when the user says "backend maintenance", "clean up the backend", "backend security check", "backend maintainer" or "/backend-maintainer".
---

# backend-maintainer

One run = one branch = one pull request that touches only `backend/`, plus GitHub issues for security findings.
Code-quality problems are **fixed** in the PR. Security problems are **filed as issues, not fixed** in this PR. The
only exception is a security fix you need just to make an unrelated fix work; say so in the PR. Never push to
`main` directly and never merge the PR yourself.

Repository: `dharaneechinnu/ai-law-portal` · base branch `main` · backend in `backend/` (FastAPI, SQLAlchemy 2, Alembic,
Postgres + pgvector, pytest). Read `CLAUDE.md` first. Its architecture rules (section 5) are the yardstick for both
the clean-up and the security audit.

## 0. Branch and environment

```bash
git fetch origin main
git checkout -B maintenance/backend-$(date +%Y-%m-%d) origin/main
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
pip install ruff vulture bandit pip-audit         # tools for this run only; do not add to requirements
```

Postgres must be running. `pytest` rebuilds its own `ai_law_test` database. If a `maintenance/backend-*` PR is
already open, update that branch instead of opening a second PR.

## 1. Baseline (record the output for the PR)

```bash
pytest -q -p no:warnings
ruff check app --select F,B,SIM,UP,PL --statistics
vulture app --min-confidence 80
```

If the baseline tests are red, fix only that first and say so in the PR.

## 2. Code clean-up (fixed in the PR)

Record each finding as `what | where (file:line) | action`.

1. **Duplicated functions.** The same logic in several services or routers: query builders, matter-visibility
   filters, pagination, date windows, "get or 404", notification creation, audit writes, provider construction.
   Search with `grep -rn "def " app | sort -k2` and compare the bodies.
   - Matter access must always go through `app/services/access.py`
     (`visible_matters`, `visible_matter_ids`, `can_view`, `matter_or_404`, `can_manage`). Hand-rolled copies are
     both duplicates and security risks.
   - Audit rows must be written only through `app/services/audit.py`. Notifications must go only through the
     notifications service.
2. **Duplicated schemas.** Pydantic models in `app/schemas.py` (and any inline ones) with the same fields under
   different names. Merge them where the API shape stays identical.
3. **Logic in routers.** `CLAUDE.md` says business logic lives in `services/`. Move non-trivial logic out of
   `app/api/*.py` into the matching service, keeping the route signature and response unchanged.
4. **Dead code.** Report vulture (80%+) and ruff `F401`/`F841`: unused imports, variables, functions and
   endpoints nothing calls. Check `alembic/`, `seed.py`, the scheduler and the agent tool registry before
   deleting anything.
5. **Bug patterns.** Ruff `B` rules: mutable defaults, bare `except` that swallows errors, timezone-naive
   `datetime.now()` where the code elsewhere is UTC-aware, sessions not closed in background jobs.
6. **Tests.** Every fix gets or extends a pytest test in `backend/tests/`. Follow the existing fixtures
   (`client`, `admin`, and similar). Also add tests for important uncovered paths you touch (RBAC 403s, matter
   access 404s).

**Rules for fixes:** API paths, request and response shapes, and DB schema stay unchanged. Do not add
migrations in a maintenance PR; if one is needed, file an issue instead. Keep each change small. Do not touch
`frontend/`.

## 3. Security audit (filed as GitHub issues)

Check every item and cite real `file:line` evidence. Tools:

```bash
bandit -r app -q -f txt
pip-audit -r requirements.txt
```

Checklist, based on the project's own rules:

1. **Authentication on every route.** Each endpoint in `app/api/*.py` depends on `get_current_user` or
   `require_roles(...)`, either on the route or the router. The only intended public routes are
   `GET /api/health`, `POST /api/auth/login`, `GET`/`POST /api/auth/setup` (POST must refuse once any user exists),
   `GET /api/auth/invite/{token}` and `POST /api/auth/accept-invite`. Write a short script that walks `app.routes` and lists any
   route without one of these dependencies.
2. **RBAC.** Admin-only areas (users, AI providers, eCourts, email and firm settings, agent policies, overrides,
   kill switch, audit log) use `require_roles("admin")`. Partner/lawyer limits match `TRACKER.md`.
3. **Matter access.** Every endpoint that takes a matter, document, task, hearing, match or timeline id checks
   visibility through `access.py`. Restricted matters must not leak through lists, search, dashboard, analytics,
   notifications, the assistant tools or RAG retrieval. Look for queries that filter by id alone.
4. **Secrets never leave the server.** LLM, embedding, eCourts and SMTP keys are encrypted at rest
   (`core/security.py`). They never appear in a response schema, log line, audit `result`, exception message or
   notification. Check `ai_settings.py`, `legal.py`, `email_settings.py` and the matching schemas.
5. **Configuration.** The default `secret_key` (`dev-only-change-me`) must not be usable outside development, and
   JWT expiry and algorithm should be pinned. CORS origins should not be `*` with credentials. The bcrypt cost
   should be sensible.
6. **Injection.** No f-string or `%` SQL inside `text(...)`. No `subprocess` or `eval`. Jinja or email templates
   must escape user input.
7. **File uploads.** Size limit, allowed types checked by content as well as extension, storage paths built from
   generated ids (never the user's filename), no path traversal on download, PDF/DOCX parsing protected against
   decompression bombs.
8. **Outbound requests (SSRF).** User- or admin-entered base URLs (LLM, eCourts, SMTP host) are only settable by
   admins. Requests have timeouts, and redirects are limited.
9. **AI safety rules.** The LLM never decides permissions. Every agent tool goes through `services/policy.py`.
   Destructive and external actions default to approval, the kill switch blocks all mutations, approvals re-check
   policy before running, and prompt text from documents cannot widen tool access.
10. **Audit integrity.** The `audit_logs` append-only trigger exists in migrations, and nothing updates or deletes
    audit rows.
11. **Login abuse.** Rate limiting or lockout on `/api/auth/login`. Invite tokens are single-use and expire.
    Password reset paths cannot be guessed.
12. **Dependencies.** `pip-audit` findings with a fixed version available.

**Filing issues.** Use one issue per distinct finding, created with the GitHub MCP tools when available
(`search_issues` then `issue_write` with method `create`), otherwise `gh issue create`.

- Before creating one, search open issues for the same title or `file:line`. If one exists, add a comment with
  the new evidence instead of opening a duplicate.
- Title: `[security][<severity>] <short problem>`. Severity is `critical`, `high`, `medium` or `low`.
- Labels: `security`, `severity:<level>`, `backend`. Create a label if it is missing; if you cannot, put the
  labels in the body.
- Body:

```markdown
**Severity:** <level> — <one line why>
**Where:** `backend/app/...py:<line>` (and others)
**What:** <plain description>
**Impact:** <who could do what>
**How to check:** <steps or a test that shows it, using local test data only>
**Suggested fix:** <concrete change>
**Rule:** CLAUDE.md §5.<n> / OWASP <category>
_Found by backend-maintainer on <date>._
```

Never paste real secrets, tokens, keys or personal data into an issue. Redact them. Do not include a working
exploit against a live system; a failing test or local steps are enough. If you find a live secret committed in
the repo, say so to the user immediately, file a `critical` issue without the value, and recommend rotating it.

## 4. Verify

```bash
pytest -q -p no:warnings
ruff check app --select F,B --statistics   # no new findings compared with the baseline
```

All tests must pass. Do not skip, xfail or delete a test to get green; fix the cause.

## 5. Commit, push, one PR

- Commit in logical steps (`refactor(backend): ...`, `test(backend): ...`), then
  `git push -u origin maintenance/backend-<date>`.
- Open ONE PR to `main` with the GitHub MCP tool `create_pull_request` when available, otherwise `gh pr create`.
  Title: `chore(backend): maintenance <date>`.
- If there are no code fixes, do not open an empty PR. Still file the security issues and report them.

PR body:

```markdown
## Summary
<one paragraph>

## Fixed
| What | Was in | Now |
|---|---|---|

## Dead code removed
- ...

## Tests
- Added/extended: <files> (<n> tests)
- `pytest`: <before> -> <after> passed

## Security issues filed (not fixed here)
- #<n> [high] ...
- #<n> [medium] ...

## Not changed (needs a decision)
- <e.g. needs a migration or an API change>
```

Finally, tell the user the PR link, the list of issues filed with their severity, and a short plain-words
summary.
