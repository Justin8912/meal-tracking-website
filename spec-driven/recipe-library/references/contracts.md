# API Contracts: recipe-library

Extends the `platform-foundation` API (base `/api/v1`, shared error envelope, server-side workspace resolution). The frontend talks only to this API; USDA is never called from the client (AD-3).

## Recipes (FR-1, FR-5, FR-6)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/recipes` | List recipes. Query: `q` (text search, FR-6), `mealType`, `tag` (filter, FR-5). |
| POST | `/recipes` | Create a recipe. 400 (error envelope) on validation failure (AC-1.5). |
| GET | `/recipes/:id` | Get one recipe with ingredients, tags, and computed nutrition (via shared engine). |
| PUT | `/recipes/:id` | Update a recipe. |
| DELETE | `/recipes/:id` | Delete a recipe. |

**Recipe (response):**
```
{ id, name, mealType: "breakfast"|"lunch"|"dinner"|"snack", servings>=1,
  notes|null, sourceLink|null, tags: string[],
  ingredients: [ { ingredientId, name, quantity, unitCode, gramsResolved, gramsConfirmed } ],
  nutrition: {
    total:      { calories, proteinG, carbsG, fatG, fiberG, micronutrients: { [name]: { amount, unit } } },
    perServing: { ...same... },
    completeness: { complete: boolean, missing: [ { ingredientId, reason } ] }
  } }
```

## Ingredients (FR-2, FR-3)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ingredients/search?q=` | USDA proxy search (Foundation+SR first, Branded fallback); server-side key; cache-aside (AD-3). On USDA outage: serve stale cache or return the error envelope (AC-2.3). |
| GET | `/ingredients/usda/:fdcId` | USDA food-detail proxy; normalized per-100g model keyed by nutrient number (F-7). |
| POST | `/ingredients` | Create a custom ingredient (FR-3): name + manually entered nutrition (macros + optional micronutrients) on a reference-grams basis. |
| GET | `/ingredients` | List the workspace's saved ingredients (USDA snapshots + custom) for reuse (AC-3.3). |

**USDA search result item (normalized):**
```
{ fdcId, description, dataType,
  per100g: { calories, proteinG, carbsG, fatG, fiberG, micronutrients: { [name]: { amount, unit } } } }
```
Adding a USDA item to a recipe snapshots its per-100g nutrition into an owned `ingredients` row (AD-4, F-11). Missing nutrients are omitted (unknown), not zero (AD-1, F-8).

## Tags (FR-5)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tags` | List the workspace's tags (for the filter UI). |
| POST | `/tags` | Create a tag (also creatable inline via the recipe payload's `tags` array). |

**Notes**
- All responses validated against shared Zod schemas (S-3). Errors use the platform error envelope `{ error: { code, message } }`.
- Downstream `weekly-planner` consumes `GET /recipes` (and its filters) when assigning recipes to days.
