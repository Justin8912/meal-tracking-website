# Session Notes — Meal Tracking Website

## What we built

A full-stack meal-tracking web app called **nourish** — a one-stop shop for recipe management, weekly meal planning, and nutrition tracking. The project is implemented across three specs (`platform-foundation`, `recipe-library`, `weekly-planner`) using spec-driven development, with all artifacts committed to a stacked branch chain.

---

## Stack

| Layer | Tech |
|---|---|
| Monorepo | npm workspaces |
| Backend | Node.js + Fastify + TypeScript + Drizzle ORM + PostgreSQL |
| Frontend | React + Vite + TypeScript + TanStack Query + dnd-kit |
| Nutrition engine | Pure shared TypeScript package (`packages/nutrition-engine`) |
| Deploy | Docker Compose (web nginx + api Fastify + postgres) |

---

## Core features built

### Recipe library
- Recipe CRUD with name, meal type, servings, notes, source link, tags
- USDA FoodData Central ingredient search (server-side proxy, API key never reaches client)
- Custom ingredient creation with manually-entered nutrition facts
- Automatic nutrition calculation via the shared engine (Atwater 4/4/9 factors; full precision, round at display only)
- Tags, meal-type filters, name search
- Expandable recipe rows showing an **ingredient nutrition table** (Ingredient | Amount | Protein | Carbs | Fat per ingredient, with a "Total per serving" footer)
- Edit and soft-delete recipes (soft delete preserves planner history via `deleted_at` column)

### Weekly planner
- Mon–Sun slot×day grid (Breakfast / Lunch / Dinner / **Snack** — four slots)
- Add recipe or freeform meals per day/slot
- Drag-and-drop edit mode (dnd-kit, touch + keyboard + tap-to-assign fallback)
- Week navigation (prev/next, year-boundary safe, history retained)
- Planned-meal detail view (notes, link, recipe nutrition)

### Nutrition summaries
- **Average per day bar** — derived from weekly server total ÷ days with meals; shown as coloured macro pills (kcal / protein / carbs / fat / fiber)
- **Day-by-day tab view** — Mon–Sun tabs, each showing that day's planned meals and macro totals from the server; tabs with a dot indicator when meals exist
- Both summaries update **live** when a meal is added or removed (all three query keys invalidated on mutation: `['plan']`, `['plan-summary']`, `['plan-daily-summary']`)

---

## Most recent work (keep an AI agent up to speed)

### Branch: `feat/daily-nutrition-tabs` (off `fix/app-runnable`)

**What changed and why:**

1. **New API endpoint `GET /plans/daily-summary?weekStart=`** (`apps/api/src/routes/plans.ts`)
   - Returns an array of 7 objects `{ dayOfWeek, hasData, calories, proteinG, carbsG, fatG, fiberG }`
   - Reuses the exact same shared-engine computation as `/plans/summary` (recipe ingredient usage → per-serving nutrition → group by `day_of_week`)
   - No new DB tables; operates on existing `plan_entries`, `recipe_ingredients`, `ingredients`

2. **New query hook `useDailyNutrition(weekStart)`** (`apps/web/src/query/plans.ts`)
   - Fetches `GET /plans/daily-summary`; cached under `['plan-daily-summary', weekStart]`
   - Exports `DayNutrition` interface

3. **`WeeklyNutritionSummary` component rewritten** (`apps/web/src/components/WeeklyNutritionSummary.tsx`)
   - **Removed**: flat `<dl>` with `MacroBar` components showing weekly totals
   - **Added**: average-per-day pill row + Mon–Sun tabbed day view
   - Tab panel shows the selected day's meals (names + slot badges) and macro totals
   - Freeform/tombstone entries show a "no nutrition data" badge

4. **Bug fix — snack slot missing** (`apps/web/src/views/WeeklyPlanner.tsx`)
   - `GRID_SLOTS` was `['breakfast', 'lunch', 'dinner']`; `'snack'` was defined in `SLOT_COLORS` and accepted by the DB but never rendered in the grid
   - Added `'snack'` to `GRID_SLOTS` → four rows now appear in the planner

5. **Bug fix — live summary updates** (`apps/web/src/query/plans.ts`)
   - `useSavePlanEntry` and `useDeletePlanEntry` were not invalidating `['plan-daily-summary']`
   - Adding/removing a meal now immediately refreshes all three: plan list, weekly average, and per-day tabs

### Older work on `fix/app-runnable` (also relevant)

- **USDA calorie derivation**: calories always derived from macros via Atwater 4/4/9 in `apps/api/src/usda/mapper.ts`; also applied in `apps/api/src/usda/cache.ts` on cache hits (Foundation Foods report energy under nutrient 957/958, not the standard 208; cache returned stale objects bypassing the mapper)
- **Ingredient deduplication**: partial unique index `(workspace_id, fdc_id) WHERE fdc_id IS NOT NULL`; snapshot upsert uses `INSERT … onConflictDoNothing` + explicit `UPDATE` to refresh stale nutrition on re-add
- **Soft delete recipes**: migration `0004` adds `deleted_at TIMESTAMPTZ`; `GET /recipes` filters `WHERE deleted_at IS NULL`; `GET /recipes/:id` still resolves soft-deleted recipes so the planner shows history
- **Unit selector**: 8 units (gram, ounce, tsp, tbsp, fl oz, cup, quart, qty) available when adding/editing ingredients; `oz` added via migration `0005`
- **Delete saved ingredients**: custom and USDA-sourced ingredients deletable from the search list; API guards against deleting ingredients that are still used in recipes

---

## Key file locations

| Purpose | File |
|---|---|
| Planner view + grid | `apps/web/src/views/WeeklyPlanner.tsx` |
| Nutrition summary (tabbed) | `apps/web/src/components/WeeklyNutritionSummary.tsx` |
| Plan query hooks | `apps/web/src/query/plans.ts` |
| Plan API routes | `apps/api/src/routes/plans.ts` |
| USDA mapper (Atwater) | `apps/api/src/usda/mapper.ts` |
| USDA cache (calorie fix) | `apps/api/src/usda/cache.ts` |
| Ingredient routes | `apps/api/src/routes/ingredients.ts` |
| Recipe routes | `apps/api/src/routes/recipes.ts` |
| DB schema | `apps/api/src/db/schema.ts` |
| Migrations | `apps/api/drizzle/000N_*.sql` (0001–0007) |
| Global CSS | `apps/web/src/styles/global.css` |
| Ingredient picker | `apps/web/src/components/IngredientPicker.tsx` |
| Recipe library view | `apps/web/src/views/MealLibrary.tsx` |

---

## Open items / known gaps

- **Reverse-proxy not implemented**: browser calls the API directly (`http://host:8100`); cross-origin CORS is allow-all (`CORS_ORIGIN=*`). Works for local use; a corporate TLS proxy will intercept the API port. The fix (nginx `/api` proxy) is designed but deferred.
- **No Playwright e2e**: corporate TLS proxy blocks browser downloads in the sandbox; manual testing only for drag-and-drop and pixel layout.
- **Existing ingredient nutrition backfill**: ingredients snapshotted before the Atwater fix may still have `calories=NULL` if they haven't been re-added since the fix. Migration `0007` backfills existing rows on startup.
- **weekly-planner spec/design/tasks** are on branch `tasks/weekly-planner` (background agent artifacts) — already folded into the implementation branch.
