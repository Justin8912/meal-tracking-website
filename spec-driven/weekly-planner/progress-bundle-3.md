# Progress: Bundle 3 — Week Navigation & History

> Tasks: spec-driven/weekly-planner/bundle-3.md | Bundle: 3 | Branch: impl/weekly-planner/bundle-3 | Last Updated: 2026-06-01

Progress: 4/4 steps complete

## Current State

- Stage: depth
- Last completed: STEP-14 — history retained (week derives from the server query, not client state)
- Next up: Bundle 4 per the task decomposition
- Blockers: none

## Step Status

| Step | Status | Commit | Notes |
|------|--------|--------|-------|
| STEP-11 | done | c288cd9 | Test-first: shiftWeek prev/next by Monday DATE incl. year + month boundaries (F-11/S-4); GET /plans 5xx surfaces error + retry (not blank/stale grid), retry refetches (AC-3.4); prev/next navigation requests adjacent Mondays and renders each week's entries (AC-3.1/AC-3.2) |
| STEP-12 | done | 979410e | shiftWeek(weekStart, dir) = adjacent Monday by +/- 7 days of UTC DATE arithmetic (never ISO week-number); WeeklyPlanner holds the active Monday in state with Previous/Next controls; displayed week driven by the week-keyed useWeekPlan query (AD-4); failed load renders error + Retry bound to refetch, replacing the grid (AC-3.4); GET /plans already serves any past/future week by Monday DATE (Bundle 1), confirmed — no API change |
| STEP-13 | done | 66c1ef4 | Test-first: API integration history (plan a past week, GET a different week with no leakage, GET the past week again intact from DB) + a year-boundary past week posted with a mid-week January date normalizing back to the December Monday (F-11); web cold-cache (gcTime 0) navigate-away-and-back re-reads the saved meal from the server |
| STEP-14 | done | 4b590ff | History retained: the displayed week is recomputed from the week-keyed query on every weekStart change; no plan data held in component state, navigation stateless beyond the active weekStart (AC-3.3). Property established by STEP-12; STEP-14 confirms + documents the invariant |

## Verification

- Per-workspace typecheck (`npx tsc --noEmit`): shared, nutrition-engine, api, web all exit 0.
- `npm test` with NO DATABASE_URL (default): nutrition-engine 35, shared 29, web 39 pass; api 13 pass + 84 DB tests skip gracefully (25 files incl. the new plans-history) — the default suite is green.
- `npm test` with a Dockerized postgres:16-alpine (migrations 0001+0002+0003 applied in lexical order): api 25 files / 97 tests pass (incl. the 2 new plans-history DB tests), shared 29, nutrition-engine 35, web 39. Two consecutive combined runs both exited 0 with all files passed; the documented cross-file teardown race logged ECONNREFUSED 127.0.0.1:1 error envelopes from unrelated files (persist.test.ts, health, and transient plans/recipes during teardown) but caused no test failures this session. Isolated api runs (plans + plans-crud + plans-history) and the full isolated api run were clean.
- Year-boundary navigation: covered at two levels. Unit (`apps/web/src/query/plans.nav.test.ts`): shiftWeek('2025-12-29','next') === '2026-01-05' and shiftWeek('2026-01-05','prev') === '2025-12-29' (plus a month boundary). Integration (`apps/api/src/routes/plans-history.test.ts`): a plan posted with a mid-week January date (2026-01-02) normalizes to and is retained under the December Monday 2025-12-29.
- Bundle Verify (achieved):
  - Navigating backward/forward loads the correct week by Monday DATE: Previous/Next shift the active weekStart by exactly -7/+7 days via shiftWeek (UTC date arithmetic, never ISO week-number, so month/year boundaries are correct, F-11/S-4); the displayed week is driven by `useWeekPlan(weekStart)` keyed `['plan', weekStart]` so revisiting a week is instant from cache (AD-4). Proven by `apps/web/src/views/WeeklyPlanner.nav.test.tsx` (AC-3.1/AC-3.2) and the navigation unit tests.
  - Past weeks retain their planned meals: a past week's entries are ordinary plan_entries rows read back by Monday DATE; revisiting after a cold cache re-reads them from the DB unchanged. Proven end-to-end by `apps/api/src/routes/plans-history.test.ts` and at the view level by `apps/web/src/views/WeeklyPlanner.history.test.tsx` (AC-3.3).
  - A failed week load shows an error + retry, not a blank/stale week: the error branch renders a role=alert message plus a Retry button bound to the query's refetch and does NOT render the day grid; the retry refetches and recovers. Proven by `apps/web/src/views/WeeklyPlanner.nav.test.tsx` (AC-3.4).

## Limitations / Notes

- Week identity is the Monday DATE (AD-2); navigation is +/- 7 days of UTC date arithmetic, not week-number math (F-11). normalizeToMonday (server) and mondayOf/shiftWeek (client) agree.
- STEP-14 added no behavioural change on top of STEP-12 — STEP-12 already derives the displayed week entirely from the week-keyed server query (no plan data in component state), which IS the AC-3.3 guarantee; STEP-14 confirms and documents the invariant. The web history test (cold cache, gcTime 0) was green immediately against the STEP-12 implementation, as expected.
- GET /plans required no change: the Bundle 1 handler already normalizes weekStart to the Monday and equality-matches week_start_date, so it serves any arbitrary past/future week (confirmed, not modified).
- Pre-existing test-suite flake (NOT introduced here): the api integration suite shares one process-wide pg pool with a latent cross-file teardown race that can surface as ECONNREFUSED 127.0.0.1:1 in unrelated DB files (~1-in-8, only in the full combined `npm test` with DATABASE_URL set; never in the default no-DB run, never in the plans/plans-history files). It logs error envelopes but the runs this session still exited 0 with all files passed; re-running is green. Fully fixing it requires per-file pool isolation (out of scope for this bundle).
- Web lint: the repo-root `npm run lint` has a known pre-existing JSX-flag quirk on apps/web; the authoritative check used here is per-workspace `npx tsc --noEmit` (all clean).

## Session Log

### 2026-06-01 — Bundle 3 implemented (STEP-11..14)
- Completed: STEP-11..14 (TDD: failing test, then impl, per step).
- Decisions: navigation state is the single active Monday; shiftWeek computes the adjacent Monday by UTC +/- 7-day date arithmetic (F-11/S-4) and is unit-tested across year + month boundaries; the displayed week is always derived from the week-keyed `useWeekPlan` query (AD-4) so revisits are cache-served and past-week history is re-read from the DB (AC-3.3); the load-failure branch shows a role=alert + Retry bound to refetch and suppresses the grid entirely so there is no blank/stale week (AC-3.4); GET /plans needed no change (Bundle 1 already serves any week by Monday DATE).
- Next: Bundle 4.
