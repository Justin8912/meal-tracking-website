# API Contracts: weekly-planner

Extends the `platform-foundation` API (base `/api/v1`, shared error envelope, server-side workspace resolution) and consumes the `recipe-library` API (`GET /recipes` + filters, `GET /recipes/:id` with computed nutrition). The frontend talks only to this API; nutrition is computed via the shared `nutrition-engine` (server-side for the weekly summary, AD-6).

The frontend uses non-2xx responses (the platform error envelope `{ error: { code, message } }`) to surface the error-path ACs (AC-1.6 save failure, AC-3.4 history load failure).

## Weekly Plans (FR-1, FR-3)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plans?weekStart=YYYY-MM-DD` | Get all entries for the week whose Monday is `weekStart` (AD-2). Drives week navigation and history (FR-3); 5xx -> AC-3.4 error state. `weekStart` is normalized server-side to the Monday. |
| POST | `/plans` | Add a planned meal to a day/slot: either `{ recipeId }` OR `{ freeformTitle, freeformDescription?, freeformLink? }` (XOR - AD-3). 400 (error envelope) on validation failure; save failure -> 5xx envelope (AC-1.6). |
| PUT | `/plans/:id` | Edit a planned meal (swap recipe, change slot/day/position, or edit freeform fields). |
| DELETE | `/plans/:id` | Remove a planned meal from a day (FR-1, AC-1.4). |

**Plan entry shape:**
```
{ id: uuid,
  weekStartDate: "YYYY-MM-DD",            // the Monday (AD-2)
  dayOfWeek: 0..6,                        // Monday=0 .. Sunday=6
  mealSlot: "breakfast"|"lunch"|"dinner"|"snack",
  position: int,
  recipeId: uuid|null, recipeName?: string,   // null after the recipe is deleted (tombstone, ON DELETE SET NULL - AD-3)
  freeformTitle: string|null, freeformDescription: string|null, freeformLink: string|null }
```
Exactly one of {`recipeId`} / {`freeformTitle`} is present (XOR CHECK in migration 0003 + the shared Zod refinement, S-1). A tombstoned entry (recipe deleted) has `recipeId: null` and no freeform fields; the UI renders a "recipe removed" state (AC-1.4 history preserved).

## Planned-Meal Detail (FR-2)

The detail view is composed client-side, not a new endpoint:
- For a **freeform** entry, the detail shows the entry's own `freeformTitle`/`freeformDescription`/`freeformLink`.
- For a **recipe** entry, the detail reads the recipe via the recipe-library `GET /recipes/:id`, which returns notes, `sourceLink`, and computed `nutrition` (via the shared engine). AC-2.1 (notes + link) and AC-2.2 (recipe nutrition available from the detail) are satisfied by this read.

## Weekly Nutrition Summary (FR-5, Nice to Have)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plans/summary?weekStart=YYYY-MM-DD` | Aggregate **macros only** across the week's recipe-based entries (server-side, via the shared `nutrition-engine` on unrounded per-serving values - AD-6, F-20). Micronutrients/%DV are not aggregated at the weekly level. Freeform entries and recipe tombstones are flagged as excluded (no nutrition data) so the UI can state what is not counted (AC-5.2). |

**Weekly summary shape:**
```
{ weekStartDate: "YYYY-MM-DD",
  totals: { calories, proteinG, carbsG, fatG, fiberG },   // macros only (AC-5.1)
  countedEntryIds: uuid[],                                  // recipe-based entries included
  excludedEntryIds: uuid[] }                                // freeform meals + recipe tombstones (AC-5.2)
```

**Notes**
- All responses validated against shared Zod schemas (S-1). Errors use the platform error envelope `{ error: { code, message } }`.
- Versioning: path-prefixed `/api/v1`. Auth is additive later (workspace resolution moves from the seeded default to a token - platform AD-5).
- Upstream: this contract assumes the recipe-library `GET /recipes` (with `q`/`mealType`/`tag` filters, used by the FR-4 recipe palette) and `GET /recipes/:id` (nutrition) are available.
