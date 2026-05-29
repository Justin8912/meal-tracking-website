# API Contracts: meal-tracking-mvp

REST API exposed by `apps/api` (Fastify). All endpoints are JSON. The frontend talks only to this API (never to USDA directly — AD-7). All requests/responses are validated against shared Zod schemas in `packages/shared` (S-3). Until auth exists, the API resolves a single seeded workspace server-side (AD-5); no workspace id appears in the client contract.

Base path: `/api/v1`. Errors use a consistent shape: `{ "error": { "code": string, "message": string } }` with appropriate HTTP status. The frontend uses non-2xx responses to surface the error-path ACs (AC-1.6, AC-7.6, AC-9.4, AC-11.5).

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Liveness + DB ping (NFR-6). Returns 200 `{status:"ok"}` or 503. |

## Recipes (FR-1, FR-5, FR-6)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/recipes` | List recipes. Query params: `q` (text search, FR-6), `mealType`, `tag` (filter, FR-5). |
| POST | `/recipes` | Create a recipe. 400 on validation failure (AC-1.5). |
| GET | `/recipes/:id` | Get one recipe with ingredients, tags, and computed nutrition. |
| PUT | `/recipes/:id` | Update a recipe (fields, ingredients, tags, servings, meal type). |
| DELETE | `/recipes/:id` | Delete a recipe (plan references become tombstones via ON DELETE SET NULL — agent decision). |

**Recipe shape (response):**
```
{
  id: uuid, name: string, mealType: "breakfast"|"lunch"|"dinner"|"snack",
  servings: int>=1, notes: string|null, sourceLink: string|null,
  tags: string[],
  ingredients: [
    { ingredientId: uuid, name: string, quantity: number, unitCode: string,
      gramsResolved: number, gramsConfirmed: boolean }   // AD-8
  ],
  nutrition: {                                            // computed via shared engine (AD-3)
    total:    { calories, proteinG, carbsG, fatG, fiberG, micronutrients: { [name]: { amount, unit } } },
    perServing: { ...same shape... },
    completeness: { complete: boolean, missing: [ { ingredientId, reason } ] }   // AD-3
  }
}
```

## Ingredients (FR-2, FR-3)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ingredients/search?q=` | USDA proxy search (Foundation+SR Legacy first, Branded fallback). Server-side key. Cache-aside (AD-7). On USDA outage: serve stale cache or 503 with a clear error (AC-2.3, NFR-7). |
| GET | `/ingredients/usda/:fdcId` | USDA food detail proxy; normalized per-100g nutrient model keyed by nutrient number (F-15). |
| POST | `/ingredients` | Create a custom ingredient (FR-3): name + manually entered nutrition (macros + optional micronutrients) on a reference-grams basis. |
| GET | `/ingredients` | List the workspace's saved ingredients (USDA snapshots + custom) for reuse (AC-3.3). |

**USDA search result item (normalized):**
```
{ fdcId: number, description: string, dataType: string,
  per100g: { calories, proteinG, carbsG, fatG, fiberG, micronutrients: { [name]: { amount, unit } } } }
```
Adding a USDA item to a recipe snapshots its per-100g nutrition into an owned `ingredients` row (AD-8/F-13). Missing nutrients are omitted (unknown), not zero (AD-3/F-16).

## Tags (FR-5)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tags` | List the workspace's tags (for the filter UI). |
| POST | `/tags` | Create a tag (also creatable inline when editing a recipe). |

(Tag→recipe association is managed through the recipe payload's `tags` array.)

## Weekly Plans (FR-7, FR-8, FR-9)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plans?weekStart=YYYY-MM-DD` | Get all entries for the week whose Monday is `weekStart` (AD-6). Used by week navigation (FR-9). 5xx → AC-9.4 error state. |
| POST | `/plans` | Add a planned meal to a day/slot: either `{ recipeId }` OR `{ freeformTitle, freeformDescription?, freeformLink? }` (XOR — FR-7). |
| PUT | `/plans/:id` | Edit a planned meal. |
| DELETE | `/plans/:id` | Remove a planned meal from a day (FR-7). |

**Plan entry shape:**
```
{ id: uuid, weekStartDate: "YYYY-MM-DD", dayOfWeek: 0..6, mealSlot: "breakfast"|"lunch"|"dinner"|"snack",
  position: int,
  recipeId: uuid|null, recipeName?: string,           // detail view (FR-8) pulls notes/link/nutrition from the recipe
  freeformTitle: string|null, freeformDescription: string|null, freeformLink: string|null }
```

## Weekly Nutrition Summary (FR-12, Nice to Have)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plans/summary?weekStart=YYYY-MM-DD` | Aggregate **macros only** across the week's recipe-based meals (server-side, via the shared engine on unrounded per-serving values — F-20). Freeform meals are flagged as excluded (no nutrition data). |

**Notes**
- Versioning: path-prefixed `/api/v1`. Auth is additive later (a future `Authorization` header + workspace resolution from the token replaces the seeded-workspace shortcut — AD-5).
- Cache headers: the static frontend serves `env-config.js` as `no-cache` (AD-11); API responses are not cached by the browser.
