# Progress: Bundle 7 — Integration & Verification

> Tasks: spec-driven/weekly-planner/bundle-7.md | Bundle: 7 | Branch: impl/weekly-planner/bundle-7 | Last Updated: 2026-06-01

Progress: 5/5 steps complete

## Current State

- Stage: integration
- Last completed: STEP-27 — mobile-responsive verification at 390px (NFR-2)
- Next up: none — weekly-planner bundles 1-7 complete and green
- Blockers: none

Bundle 7 wires and verifies the WHOLE weekly planner end to end. No new product
behavior is added; the bundle is verification artifacts that re-run via the
suite (no fake-passing tests, no skipped assertions beyond the DB-skip-gracefully
pattern). Each step is a repeatable committed spec at the highest level the
sandbox allows, with the true-browser gap documented as a manual/Playwright
check — exactly the recipe-library Bundle 6 fallback.

- **STEP-23 (plan-a-week e2e, `c5a3e1b`)** — `apps/api/src/routes/
  e2e-plan-a-week.test.ts` drives the real api -> drizzle -> postgres stack
  (Supertest): POST a MIX of recipe-backed and freeform meals across days/slots
  (one via a mid-week date to exercise Monday normalization, AD-2), reload the
  week via GET /plans?weekStart=, and assert every meal persists unchanged on its
  correct day/slot with NO cross-week leakage (AC-1.3/AC-1.4). The recipe/freeform
  XOR is rejected for both the both-set and neither-set cases with the shared 400
  envelope, persisting nothing (AC-1.2, S-1).
- **STEP-24 (touch DnD + tap-to-assign e2e, `6c804f0`)** — `apps/web/src/views/
  WeeklyPlanner.touch-e2e.test.tsx` asserts the live dnd-kit config carries BOTH
  a PointerSensor touch activation DELAY and movement TOLERANCE (scroll is not
  hijacked into a drag, F-3) plus a KeyboardSensor (a11y), on the SAME
  POINTER_ACTIVATION/PLANNER_SENSORS the DndContext is built from; and drives the
  tap-to-assign fallback through the WHOLE WeeklyPlanner -> POST /plans with a
  recipe-only body for the tapped day/slot (XOR, S-1), inert until a recipe is
  picked (AC-4.4, NFR-2).
- **STEP-25 (year-boundary history e2e, `33c0403`)** — `apps/api/src/routes/
  e2e-week-history.test.ts` drives navigation across the 2025/2026 boundary
  through the real stack: plan a meal in the boundary week (Mon 2025-12-29,
  POSTed with a January in-week date to also prove normalization), navigate
  forward into January (next Mon 2026-01-05) and back, then to the prior 2025
  week. Each week resolves by its own Monday DATE and the boundary meal is intact
  on return (AC-3.1/AC-3.3); the row is keyed by the December Monday — the F-11
  guard. Navigation mirrors the SPA's `shiftWeek` pure-UTC arithmetic (web is not
  importable from api; replicated and pinned to the web's plans.nav.test.ts).
- **STEP-26 (weekly-summary e2e, `32d289b`)** — `apps/api/src/routes/
  e2e-weekly-summary.test.ts` plans a week of recipe meals (real ingredient
  nutrition) + a freeform meal via POST /plans, then reads GET /plans/summary.
  Totals match the sum of UNROUNDED per-serving values recomputed with the SAME
  shared nutrition-engine, rounded once (F-20/S-5); micronutrients are NOT
  aggregated weekly even though a counted recipe carries Iron (AC-5.1); the
  freeform meal is flagged excluded and both recipe meals counted, never
  zero-counting freeform (AC-5.2). Response validated against weeklySummarySchema.
- **STEP-27 (mobile-responsive, `32ad3b6`)** — `apps/web/src/views/
  WeeklyPlanner.responsive.test.tsx` verifies at 390px (jsdom) that the core
  flows are completable — view the week, navigate prev/next, open a meal detail,
  add/edit a meal, enter edit mode and assign by tap — with every control labeled
  and keyboard-focusable (WCAG 2.1 AA basics), and that the edit mode collapses to
  a single-column palette-over-week layout (base grid is one minmax(0,1fr) track;
  the two-panel split is opt-in behind the >=768px media query, WeekGrid.tsx).

New `npm run e2e:planner -w @meal-tracking/api` runs the three DB-backed planner
e2e specs (plan-a-week, year-boundary history, weekly summary). The full
`npm test` stays green WITHOUT a DB/browser (DB-backed tests skip-gracefully);
with `DATABASE_URL` set against a Dockerized postgres they all run. No emojis
(S-7); rounding only via the engine's formatNutrition (S-5); the shared error
envelope is reused (S-1).

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-23 | done | `c5a3e1b` | E2E plan-a-week (recipe + freeform across days/slots, mid-week normalization), reload unchanged + no leakage, both-set/neither-set XOR rejected with envelope (AC-1.2/1.3/1.4). Integration fallback (Supertest -> api -> Dockerized postgres) — TLS proxy blocks Playwright browser DL; raw browser click-through documented manual |
| STEP-24 | done | `6c804f0` | E2E touch DnD + tap-to-assign: PointerSensor delay+tolerance + KeyboardSensor on the live config; tap-to-assign through the whole planner -> POST /plans recipe-only, inert until a pick (AC-4.4, NFR-2). Component/jsdom fallback — raw touch-DRAG gesture is a documented manual/Playwright check (jsdom cannot simulate it; browser DL blocked) |
| STEP-25 | done | `33c0403` | E2E week-history across the 2025/2026 boundary: navigate fwd/back + prior week, each resolves by its Monday DATE, boundary meal retained, row keyed by December Monday (AC-3.1/3.3, F-11). Integration fallback; raw browser back/forward documented manual. Navigation mirrors the SPA shiftWeek (pinned to plans.nav.test.ts) |
| STEP-26 | done | `32d289b` | E2E weekly summary: plan-then-summarize via the stack; macro totals = unrounded per-serving sum via the shared engine (F-20); no weekly micros (AC-5.1); freeform flagged excluded, recipes counted (AC-5.2); validated vs weeklySummarySchema. Integration fallback; component covered by WeeklyNutritionSummary jsdom test; browser render documented manual |
| STEP-27 | done | `32ad3b6` | Responsive/a11y at 390px (jsdom): view week, nav, detail, add/edit, tap-assign all completable; controls labeled + focusable (WCAG 2.1 AA basics); edit mode collapses to single column (base minmax(0,1fr); two-panel opt-in >=768px). Component fallback — pixel overflow/clipping is a documented manual/Playwright check |

## Verification

Bundle Verify (e2e, at the highest feasible level — integration via the running
api -> drizzle -> Dockerized postgres stack with Supertest, and component/jsdom
for the SPA; true browser e2e documented as manual/Playwright):

- **Plan a week (recipe + freeform)** — PASS (STEP-23): mixed meals persist on
  the correct day/slot and reload unchanged; the XOR is rejected (AC-1.2/1.3/1.4).
- **Touch assignment (drag + tap)** — PASS (STEP-24): the live PointerSensor
  carries the touch delay+tolerance (scroll is not a drag) and a KeyboardSensor;
  tap-to-assign assigns via POST /plans recipe-only end to end (AC-4.4, NFR-2).
  Raw touch-DRAG gesture: documented manual/Playwright.
- **Week history across a year boundary** — PASS (STEP-25): forward/back across
  2025->2026 each resolve by Monday DATE; the boundary week's meal is retained
  (AC-3.1/3.3, F-11). Raw browser back/forward: documented manual.
- **Weekly macro summary** — PASS (STEP-26): totals correct (unrounded sum, round
  once); micronutrients not aggregated (AC-5.1); freeform flagged excluded
  (AC-5.2). Browser render: documented manual.
- **Usable at 390px** — PASS (STEP-27): core flows completable; edit mode
  collapses to a single column; controls labeled + focusable (NFR-2). Pixel-level
  overflow/clipping: documented manual.

Results:
- Per-workspace `tsc --noEmit`: shared / nutrition-engine / api / web — all clean.
- Full `npm test` (no DB, no browser): nutrition-engine 35, shared 29, api 13
  passed + 97 DB-skipped (incl. the 3 new planner e2e specs), web 70 — all green.
- Full DB-backed `npm test -w @meal-tracking/api` (Dockerized postgres:16-alpine):
  29 files / 110 tests green (was 26/102; +3 files, +8 tests). `npm run
  e2e:planner` runs the 3 planner e2e specs standalone (8 tests green).
- `vite build` (web): tsc --noEmit + vite build succeed (98 modules, built OK).
- Full web suite: 23 files / 70 tests green (was 21/61; +2 files, +9 tests).

## Limitations / Notes

- **Environment limitation (documented, not blocking)**: the in-sandbox corporate
  TLS-intercepting proxy blocks public-registry docker IMAGE builds and Playwright
  browser downloads. `postgres:16-alpine` pulls fine, so STEP-23/25/26 run as
  INTEGRATION-level e2e (Supertest against the real Dockerized postgres) and
  STEP-24/27 as COMPONENT-level (jsdom), rather than true browser e2e. The
  true-browser gaps — raw touch-DRAG gesture (STEP-24), browser back/forward
  (STEP-25), summary render (STEP-26), pixel overflow/clipping at 390px (STEP-27)
  — are documented as explicit manual/Playwright checks (note tests) to promote to
  Playwright once a browser is reachable.
- `scripts/smoke.sh` (full compose stack) still SKIPs gracefully here: the web/api
  image `npm ci` cannot reach the registry through the proxy (a local gitignored
  `*.verify` overlay exists for in-sandbox image verification). The DB-backed
  Supertest stack is the verified end-to-end path, per the Bundle 6 precedent.

## Session Log

### 2026-06-01 — Bundle 7 complete (5/5)

- **Completed**: STEP-23, STEP-24, STEP-25, STEP-26, STEP-27.
- **Approach**: each MANUAL e2e step shipped as a committed, repeatable spec at
  the highest feasible level (integration via the running api -> drizzle ->
  Dockerized postgres stack with Supertest for the server flows; component/jsdom
  for the SPA), with the true-browser portion documented as a manual/Playwright
  check — the recipe-library Bundle 6 fallback. The api e2e specs DB-skip
  gracefully so the default `npm test` stays green without a DB or browser; a new
  `e2e:planner` script runs them standalone against a running postgres.
- **STEP-25 cross-workspace note**: the web `shiftWeek` is the canonical week
  navigation (unit-tested in apps/web/src/query/plans.nav.test.ts). Because the
  web workspace is not importable from the api workspace, the year-boundary e2e
  replicates the same pure-UTC arithmetic inline (normalize to Monday, +/-7 days,
  never ISO week-number math) and pins it to the canonical test in a comment, so
  the client stepping and the server normalization are proven to AGREE across the
  year edge — the integration gap a unit test of either half alone would miss.
- **Decisions**: kept all new specs OUT of needing a browser; no Playwright specs
  were added (a browser is unreachable), so the default `vitest`/`npm test` stays
  green without one. The two new web specs run under the web workspace's
  jsdom vitest config (the root config is Node — run via `npm test -w
  @meal-tracking/web` or `--config apps/web/vitest.config.ts`).
- **Pre-existing pg-pool teardown race**: not observed in this session's full
  DB-backed run (29/110 green); it remains a documented ~1-in-8 intermittent
  ECONNREFUSED in an unrelated DB test file that is green on re-run and never
  appears in the default no-DB `npm test`.
- **Next**: none — weekly-planner bundles 1-7 are complete and green.
