# Bundle 6: Weekly Nutrition Summary (Nice to Have)

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: yes (file-disjoint summary endpoint + component; depends on Bundle 1 schema/routes; mounts into WeeklyPlanner) | Files: apps/api/src/routes/plans.ts, apps/web/src/components/WeeklyNutritionSummary.tsx, apps/web/src/views/WeeklyPlanner.tsx, apps/web/src/query/plans.ts

**Bundle Verify**: The weekly summary aggregates macros only across the week's recipe-based meals and makes clear which meals (freeform / tombstones) are not counted.
- **Level**: integration
- **Given**: a week with recipe-based meals and at least one freeform meal
- **Action**: view the weekly summary
- **Outcome**: aggregated macros (calories/protein/carbs/fat/fiber) are shown; vitamins/minerals are not aggregated; the freeform meal is flagged as excluded

> **Context**
>
> **Applicable ACs**
> - **AC-5.1**: Given: a week with planned recipe-based meals / When: I view the weekly summary / Then: aggregated macros (calories, protein, carbs, fat, fiber) for the week are shown; vitamins/minerals are not aggregated at the weekly level for MVP
> - **AC-5.2**: Given: a week containing freeform meals with no nutrition data / When: I view the weekly summary / Then: the summary makes clear which meals are not counted
>
> **Priority**: Nice to Have (FR-5) — lighter coverage than the Must-Have FRs.
>
> **Architecture Decisions**
> - **AD-6: Weekly nutrition summary aggregates macros only, via the shared engine on unrounded values** — Decision: GET /plans/summary sums macros only across recipe-based entries server-side (shared engine, unrounded per-serving, round at display); freeform + tombstones flagged excluded. Rationale: %DV/micros not summable across ingredients; matches AC-5.1.
>
> **Findings**
> - **F-20: Round-at-display; aggregate macros, not %DV** — sum full-precision per-serving macros; %DV/micros not aggregated at the week level.
>
> **Standards**
> - **S-5**: Round nutrition only at display; aggregate macros (not %DV) on unrounded values (Domain: other | File Type: .ts/.tsx)
> - **S-1**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - GET /plans/summary?weekStart=YYYY-MM-DD — macros-only totals + countedEntryIds/excludedEntryIds

#### STEP-21: Test-first — weekly macro summary + exclusions
MANUAL -> Test-first for STEP-22

> **Intent**: The summary must sum macros from full-precision per-serving values via the shared engine (not by adding already-rounded per-recipe displays, which compounds error — F-20) and must clearly separate counted recipe-based meals from excluded freeform meals and recipe tombstones (AC-5.2). Tests must assert the aggregated macros match a hand-computed expected total within tolerance, that micronutrients are NOT aggregated (AC-5.1), and that a week's freeform meal appears in the excluded set, not silently zero-counted.

- Write Supertest tests for GET /plans/summary: a week with two recipe meals + one freeform yields macro totals matching the hand-computed sum within tolerance; the response carries no aggregated micronutrients; the freeform entry id is in excludedEntryIds
- Tests fail before STEP-22

**Verify**:
- Level: integration | Given: the summary test | Action: run before STEP-22 | Outcome: fail (endpoint not implemented)

> Depends on: STEP-5 | Enables: STEP-22 | Parallel with: STEP-15

#### STEP-22: Weekly nutrition summary endpoint + UI (macros only)
[FR-5 -> AC-5.1, AC-5.2] | modify `apps/api/src/routes/plans.ts`, `apps/web/src/query/plans.ts`; create `apps/web/src/components/WeeklyNutritionSummary.tsx`; modify `apps/web/src/views/WeeklyPlanner.tsx` | Effort: M

> **Intent**: Implement GET /plans/summary?weekStart= that aggregates macros only (calories/protein/carbs/fat/fiber) across the week's recipe-based entries server-side, using the shared `nutrition-engine` on unrounded per-serving values and rounding only at display (AD-6, S-5). Micronutrients/%DV are not aggregated (not summable across differing reference amounts, AC-5.1). Freeform entries and recipe tombstones carry no nutrition and are returned in `excludedEntryIds` so the UI can state exactly which meals are not counted (AC-5.2) — never silently zero-counting them. The UI renders the macro totals and an explicit "not counted" note. As a Nice-to-Have, this is a single behavioral step (lighter than the Must-Have FRs).
> **Standards**: S-5, S-1, S-7

- Implement GET /plans/summary: load the week's entries, compute macro totals across recipe-based entries via the shared engine (unrounded), collect excluded (freeform + tombstone) ids
- Add a `useWeeklySummary(weekStart)` TanStack Query hook
- Build WeeklyNutritionSummary: show the five macro totals (rounded at display) and a clear list/flag of excluded meals; mount it in WeeklyPlanner
- Do not aggregate micronutrients/%DV (AC-5.1)

**Verify**:
- Level: integration | Given: a week with recipe meals + a freeform meal | Action: GET /plans/summary and render the summary | Outcome: macro totals shown (rounded at display) matching the hand-computed sum; no aggregated vitamins/minerals (AC-5.1); the freeform meal flagged as excluded (AC-5.2) — STEP-21 tests pass

> Depends on: STEP-21, STEP-5 | Enables: — | Parallel with: STEP-16
