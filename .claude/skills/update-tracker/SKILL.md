---
name: update-tracker
description: Check which project features are completed and update the Google Sheets feature tracker to match. Use when the user says "update tracker", "update in spreadsheet", or after finishing a feature.
---

# update-tracker

Keep the Google Sheets feature tracker in step with what is actually built.

Spreadsheet: https://docs.google.com/spreadsheets/d/12W3UFdPmQwounF4CWLC8Exx52Ok5wfOF8g0BiOdKelQ/edit
Spreadsheet ID: `12W3UFdPmQwounF4CWLC8Exx52Ok5wfOF8g0BiOdKelQ`

## Sheet layout

- **One tab per feature**, named for the feature (Login, Roles & Permissions, Case Access Control, Team Management, Email Sending, My Account, Clients, Matters, Case Timeline, Document Upload, Ask AI, AI Provider Settings, Dashboard, Daily Briefing, Notifications, Tasks, Calendar & Hearings, People, Legal Intelligence, Case Comparison, Legal Alerts, AI Agents, Approval System, Kill Switch & Overrides, Integration Settings, Audit Log, Analytics).
- Each feature tab has columns `# | Task | Details | Status | Notes`. Status is column D and is one of `Done`, `Scaffolded`, `Not started`.
- The `Feature Tracker` tab is the overview list. Update its Status column (E) when a feature as a whole changes.

## Steps

1. **Find what is done.** Read `TRACKER.md` and the "Current state" section of `CLAUDE.md`. Confirm against the code before trusting them: check the router in `backend/app/api/`, the service in `backend/app/services/`, and the page under `frontend/src/features/`. A feature is `Done` only when its backend and frontend both exist and work; `.gitkeep` stubs and `routes/Placeholder.tsx` pages are `Not started`; structure without logic is `Scaffolded`.
2. **Read the sheet.** Use the Google Sheets connector (`get_spreadsheet` with `fields: ["sheets.properties"]` for tab names, then `get_values` on each tab, e.g. `'Dashboard'!A1:E50`). If the Sheets tools are not loaded, search for them with ToolSearch ("google sheets spreadsheet values").
3. **Compare** each task row's Status with what the code shows. List every difference before writing.
4. **Update only the cells that changed.** Use `update_values` on the specific Status or Notes cell (for example `'Tasks'!D3`). Keep the dropdown values exactly: `Done`, `Scaffolded`, `Not started`. Update the matching row on the `Feature Tracker` tab too.
5. **Never delete.** Do not clear ranges, delete tabs or remove rows. If a feature needs new tasks, append rows with `append_values`. If a new feature exists, add a new tab by `addSheet` and copy the format of an existing tab, and add it to the `Feature Tracker` tab.
6. **Verify.** Read the updated cells back with `get_values` and check they show the new values.
7. **Report** in plain words: which features changed status, which tabs were touched, and the spreadsheet link. Say so if something could not be checked (for example, the app was not run).

## Rules

- Statuses come from the code and `TRACKER.md`, not from guesses. If the evidence is unclear, leave the status and say what is unclear.
- Also keep `TRACKER.md` in step: `[x]` done, `[~]` scaffolded, `[ ]` not started.
- Only change the sheet when asked or after the user says "update in spreadsheet". Showing a preview in chat is the default.
