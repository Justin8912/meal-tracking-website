# Bundle 3: Week Navigation & History

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: no (extends WeeklyPlanner.tsx, query/plans.ts, routes/plans.ts from Bundles 1-2) | Files: apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts, apps/api/src/routes/plans.ts

**Bundle Verify**: Navigating backward/forward loads the correct week by Monday DATE, past weeks retain their planned meals, and a failed week load shows an error with retry rather than a blank/stale week.
- **Level**: integration
- **Given**: api + seeded postgres with plans in multiple weeks (incl. a year-boundary week)
- **Action**: navigate to the previous and next week; revisit a past planned week; force a week load to fail
- **Outcome**: each week resolves by its Monday DATE; the past week's meals are intact; the failed load shows an error + retry (not blank/stale)

> **Context**
>
> **Applicable ACs**
> - **AC-3.1**: Given: the current week / When: I navigate backward / Then: the previous week's saved plan is displayed
> - **AC-3.2**: Given: the current week / When: I navigate forward / Then: the next week is displayed, ready to plan
> - **AC-3.3**: Given: a previous week that had meals planned / When: I navigate back to it later / Then: the previously planned meals are still present
> - **AC-3.4**: Given: a request to load a past or upcoming week / When: the data fails to load / Then: an error is shown rather than a blank/stale week, and I can retry
>
> **Architecture Decisions**
> - **AD-2: Identify a week by week_start_date (the Monday's DATE)** — Decision: navigation shifts weekStart by 7 days; history is a date range-query. Rationale: avoids ISO 53-week/year-boundary bugs.
> - **AD-4: Planner server state via TanStack Query keyed by week** — Decision: each week is a distinct `['plan', weekStart]` cache entry; revisiting is instant. Rationale: NFR-1; surfaces load failure (AC-3.4).
>
> **Findings**
> - **F-11: Prototype week-key has ISO/year-boundary bug** — shift/compute by the Monday DATE, never the YYYY-Www string.
> - **F-4: TanStack Query keyed by week makes navigation instant** — cached weeks render immediately; isError drives the retry state.
>
> **Standards**
> - **S-4**: Identify a week by the Monday DATE computed server-side; never an ISO week string (Domain: other | File Type: .ts)
> - **S-2**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts/.sql)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - GET /plans?weekStart=YYYY-MM-DD — week navigation/history; 5xx -> AC-3.4 error state

#### STEP-11: Test-first — week navigation + load-failure
MANUAL -> Test-first for STEP-12

> **Intent**: The week-boundary bug is the central risk (F-11). Tests must assert that navigating backward/forward computes the adjacent Monday correctly — including across a year boundary (e.g. the week spanning Dec->Jan) where naive ISO-week math breaks — and that a failed week load shows an error + retry, not a blank or stale (previous-week) grid (AC-3.4).

- Write tests: from a given Monday, "previous" yields Monday-7d and "next" yields Monday+7d, verified across a year-boundary week; GET /plans with a 5xx surfaces isError; the UI shows an error + retry, not a blank/stale week
- Tests fail before STEP-12

**Verify**:
- Level: unit | Given: the navigation + load-failure tests | Action: run before STEP-12 | Outcome: fail (navigation/error state not implemented)

> Depends on: STEP-6 | Enables: STEP-12 | Parallel with: —

#### STEP-12: Week navigation (prev/next) + history range query + load-failure
[FR-3 -> AC-3.1, AC-3.2, AC-3.4] | modify `apps/web/src/views/WeeklyPlanner.tsx`, `apps/web/src/query/plans.ts`, `apps/api/src/routes/plans.ts` | Effort: M

> **Intent**: Navigation shifts the active `weekStart` by +/- 7 days and re-queries the week-keyed TanStack Query (AD-2/AD-4); computing the adjacent Monday by date arithmetic (not week-number math) avoids the year-boundary bug (F-11, S-4). A revisited week renders instantly from cache (NFR-1). On a load error the view shows a clear message + a retry control bound to TanStack Query's `refetch`, never a blank or stale-week grid (AC-3.4). The GET /plans handler already range/normalizes by Monday (Bundle 1); confirm it serves arbitrary past/future weeks.
> **Standards**: S-4, S-2, S-7

- Add prev/next week controls that set the active weekStart to the adjacent Monday (date arithmetic; year-boundary safe)
- Drive the displayed week via the week-keyed `useWeekPlan(weekStart)` query so revisited weeks are served from cache
- Render an error + retry state when the week query fails (isError -> message + refetch), distinct from loading/empty
- Confirm GET /plans?weekStart= serves any past/future week's entries by Monday DATE

**Verify**:
- Level: integration | Given: the current week | Action: navigate backward then forward | Outcome: the previous (Monday-7d) and next (Monday+7d) weeks display correctly, including across a year boundary (AC-3.1/AC-3.2)
- Level: integration | Given: a week whose load fails | Action: navigate to it | Outcome: an error + retry is shown, not a blank/stale week; retry refetches (AC-3.4) — STEP-11 tests pass

> Depends on: STEP-11, STEP-5 | Enables: STEP-14 | Parallel with: —

#### STEP-13: Test-first — history retained
MANUAL -> Test-first for STEP-14

> **Intent**: AC-3.3 is the history guarantee: a past week that had meals must still show them when revisited later, with no reliance on client state. The test must plan meals in a past week, navigate away and back (forcing a refetch / cache miss), and assert the meals are read back from the DB unchanged.

- Write an integration/e2e test: plan meals in a past week, navigate to another week and back (cache invalidated/cold), assert the past week's meals are present from the DB
- Tests fail before STEP-14

**Verify**:
- Level: integration | Given: the history-retained test | Action: run before STEP-14 | Outcome: fail (not yet verified end-to-end)

> Depends on: STEP-12 | Enables: STEP-14 | Parallel with: —

#### STEP-14: History retained across navigation
[FR-3 -> AC-3.3] | modify `apps/web/src/views/WeeklyPlanner.tsx` | Effort: S

> **Intent**: Past-week plans are ordinary `plan_entries` rows, so history is retained by persistence (AD-1); this step ensures the view reads each week's plan from the server (via the week-keyed query) rather than ephemeral client state, so revisiting a past week — even after a cold cache — shows the saved meals unchanged (AC-3.3).
> **Standards**: S-4, S-7

- Ensure the displayed week always derives from the week-keyed server query (no meals held only in component state)
- Verify a revisited past week (after cache eviction) re-reads its entries from the DB
- Keep navigation stateless beyond the active weekStart

**Verify**:
- Level: integration | Given: meals planned in a past week | Action: navigate away and back (cold cache) | Outcome: the past week's meals are still present, read from the DB (AC-3.3) — STEP-13 tests pass

> Depends on: STEP-13, STEP-12 | Enables: — | Parallel with: —
