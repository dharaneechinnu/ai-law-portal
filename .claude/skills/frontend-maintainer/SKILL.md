---
name: frontend-maintainer
description: Maintain the React frontend in one pass - find duplicated components, pages, hooks, helpers, constants and dead code, consolidate them without changing behaviour, set up or extend Vitest tests, run type-check, tests and build, and open ONE frontend pull request. Use when the user says "frontend maintenance", "clean up the frontend", "check frontend duplicates", "frontend maintainer" or "/frontend-maintainer".
---

# frontend-maintainer

One run = one branch = one pull request that touches only `frontend/`. The PR removes duplication, adds tests and
leaves behaviour and visuals unchanged. Never push to `main` directly and never merge the PR yourself.

Repository: `dharaneechinnu/ai-law-portal` · base branch `main` · frontend in `frontend/` (React 18, Vite 5, TS, Tailwind v4,
TanStack Query 5). Read `CLAUDE.md` first; its architecture rules still apply.

## 0. Branch

```bash
git fetch origin main
git checkout -B maintenance/frontend-$(date +%Y-%m-%d) origin/main
cd frontend && npm ci   # or npm install if there is no lockfile
```

If a `maintenance/frontend-*` PR is already open, update that branch instead of opening a second PR.

## 1. Baseline (record the output for the PR)

```bash
npx tsc -b            # must pass before you change anything
npm run build
npm test --if-present
```

If the baseline is already red, fix only what blocks the build first and say so in the PR.

## 2. Test framework (first run only)

If `vitest` is not in `package.json`, set it up:

```bash
npm i -D vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14 jsdom@^25
```

- `vite.config.ts`: add `test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.ts", css: false }`
  (add `/// <reference types="vitest/config" />` at the top).
- `src/test/setup.ts`: `import "@testing-library/jest-dom/vitest";`
- `src/test/render.tsx`: a `renderWithProviders(ui, { route })` helper that wraps in `QueryClientProvider` (new client,
  `retry: false`), `MemoryRouter` and a fake `AuthContext` user, so page tests are one line.
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- Mock the API with `vi.mock("@/services/api", ...)`. Tests never call the real backend.
- Make sure `tsconfig` includes the test files (or add `tsconfig.test.json`) so `tsc -b` still passes.

## 3. Find duplication and dead code

Work through every item. Use real searches; do not guess. Record each finding as
`what | where (file:line) | action`.

**Known shared homes** (consolidate INTO these, do not create parallel ones):

| Need | Shared module |
|---|---|
| class names | `cn` in `src/lib/utils.ts` |
| page cover, tabs, empty states, hero buttons | `src/components/ui/page.tsx` (`PageHero`, `Tabs`, `EmptyState`, `heroButton`, `heroGhost`) |
| side panel, labelled field, input class | `src/components/ui/drawer.tsx` (`Drawer`, `Label`, `control`) |
| buttons, fields | `src/components/ui/button.tsx`, `field.tsx` |
| initials, relative time, roles | `src/features/admin/roles.ts` |
| count-up animation | `useCountUp` in `src/features/dashboard/widgets.tsx` |
| illustrations | `src/components/brand/Spots.tsx`, `LegalIllustration.tsx` |
| app commands and shortcuts | `src/lib/shortcuts.ts` |
| theme | `src/lib/theme.ts` |

**Checks**

1. **Same-named components or functions in more than one file.**
   `grep -rhoE "export (function|const) [A-Z][A-Za-z0-9]+" src | sort | uniq -d`, plus private ones
   (`function Card(`, `function Row(`, `function Stat(`, `function Section(`, `function Switch(`).
   Same name is not always a duplicate. Compare the bodies.
2. **Copy-pasted helpers.** Date and time formatters (`toLocaleDateString`, `toLocaleTimeString`, `fmtDay`,
   `time(`), `clamp`, `initials`, percentage formatters, `toDue`/`toInput` date helpers, and the
   `startOfWeek`/`localDate` calendar helpers.
3. **Repeated constants.** Tone maps (`PRIORITY_TONE`, `STATUS_TONE`, `TONE`), role lists, local `control`/`input`
   class strings that copy `components/ui/drawer.tsx`, and repeated card class strings such as
   `rounded-[20px] border border-ink-100 bg-white`. Only extract a class string when it appears 3 or more times
   with the same meaning.
4. **Repeated hooks and effects.** Click-outside plus Escape-to-close, polling patterns, localStorage read/write with
   try/catch, and debounced save.
5. **Repeated API usage.** The same `useQuery` key and URL defined in several files (`["matters"]`, `["clients"]`,
   `["users"]`, `["approvals","count"]`). Move them to one small query hook when used in 3 or more places. Check that
   invalidation keys still match after the move.
6. **Overlays rendered inside the page.** Any `fixed inset-0` overlay that is not in a portal. Page transitions
   offset these (this already happened once), so the fix is `createPortal(..., document.body)`.
7. **Dead code.** Run `npx knip --no-progress` (or `npx ts-prune`), then remove unused files, exports and
   dependencies. Double-check dynamic uses (route elements, `lazy()`) before deleting.
8. **Leftover old styles.** `slate-*` colours or `rounded-md border px-3` inputs. These come from before the
   navy/brass redesign and should use the shared tokens. Watch for false hits such as `translate-*` and
   `-translate-x`.

**Rules for fixes**

- Behaviour and visuals stay identical. A fix must not change user-visible text, layout, routes or API calls.
- Prefer moving code into the existing shared module over inventing a new abstraction. Leave 2–3 line
  similarities alone if merging them adds parameters or flags.
- Keep each consolidation small and reviewable, and update every caller in the same commit.
- Do not touch `backend/`. Do not change the design. Do not add libraries other than the test ones above.

## 4. Tests

For every helper, hook or component you consolidated, add or extend a test next to it (`*.test.ts(x)`).
Also keep a small smoke suite:

- each shared helper (`initials`, `relativeTime`, date helpers, `clamp`): edge cases (empty name, just now, month
  boundaries).
- `PageHero`, `Tabs` (keyboard and `aria-selected`), `EmptyState`, `Drawer` (portal, Escape, close button).
- the dashboard layout `normalize` logic: old `size: half/full` layouts map to widths, and `w` and `h` are
  clamped.
- `Dock`: the side is read from and written to `localStorage`, and the arrow keys move it.
- one render test per main page with the API mocked (renders without crashing and shows its title).

Run `npm test`. All tests must pass. Do not skip, `.only`, or delete a failing test to get green; fix the cause.

## 5. Verify

```bash
npx tsc -b && npm test && npm run build
```

If a backend and dev server are available, also open the changed pages in a browser (Playwright is preinstalled in
cloud sessions) and confirm there are no console errors.

## 6. Commit, push, one PR

- Commit in logical steps (`chore(frontend): ...`, `test(frontend): ...`), then
  `git push -u origin maintenance/frontend-<date>`.
- Open ONE PR to `main`. Use the GitHub MCP tool `create_pull_request` when it is available, otherwise
  `gh pr create`. Title: `chore(frontend): maintenance <date>`.
- If nothing was found and there are no new tests, do not open an empty PR; report "frontend clean" instead.

PR body:

```markdown
## Summary
<one paragraph: what was duplicated, what was consolidated, tests added>

## Duplicates removed
| What | Was in | Now in |
|---|---|---|

## Dead code removed
- ...

## Tests
- Added: <files> (<n> tests)
- `npm test`: <pass count>  ·  `tsc -b`: pass  ·  `npm run build`: pass

## Not changed (needs a decision)
- <anything that looked duplicated but would change behaviour if merged>
```

Finally, tell the user the PR link and a 3–5 line summary in plain words.
