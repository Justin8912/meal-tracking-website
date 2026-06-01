import { useMemo } from 'react';
import type { PlanEntry, RecipeDetail } from '@meal-tracking/shared';
import {
  computeRecipeNutrition,
  formatNutrition,
} from '@meal-tracking/nutrition-engine';
import type { NutritionLine } from '@meal-tracking/nutrition-engine';
import { useRecipeDetail } from '../query/recipes.js';
import { MacroBar } from './MacroBar.js';
import {
  useIngredients,
  toEngineNutrition,
  absentMacrosOf,
  type SavedIngredient,
} from '../query/ingredients.js';

/**
 * Planned-meal detail view (STEP-16, FR-2, AC-2.1/AC-2.2; AD-3/AD-4).
 *
 * Clicking a planned meal in the week grid opens this detail. It branches on
 * the entry shape (AD-3):
 *   * FREEFORM (freeformTitle set): show the entry's own title/description and
 *     the link only when present — never a broken/empty anchor (AC-2.1).
 *   * RECIPE-BACKED (recipeId set): read the recipe via recipe-library
 *     `GET /recipes/:id` for notes/link, and surface its nutrition breakdown
 *     composed CLIENT-SIDE through the shared engine. The detail endpoint
 *     carries only ingredient USAGE (id/quantity/unit); `GET /ingredients`
 *     carries the per-`referenceGrams` nutrition. Joining the two reproduces a
 *     recipe's nutrition without duplicating nutrition logic or adding a new
 *     endpoint (AD-4). Nutrition is rendered ONLY through `formatNutrition` —
 *     the engine's single rounding boundary (S-5) — and the completeness flag
 *     surfaces missing data instead of zero-filling it (AC-2.2).
 *   * TOMBSTONE (recipeId NULL + no freeform fields): the referenced recipe was
 *     deleted; show a clear "recipe removed" state, no nutrition (AD-3). No
 *     recipe fetch is issued.
 *
 * No emojis (S-7).
 */

export interface PlannedMealDetailProps {
  entry: PlanEntry;
}

/**
 * Build the shared-engine lines for a recipe: join its ingredient usage (from
 * the recipe detail) to the per-`referenceGrams` ingredient nutrition (from the
 * ingredient list). Mirrors the editor/e2e reload flow exactly so the planner
 * never re-implements nutrition. An ingredient missing from the list cannot be
 * computed; it is dropped from the lines and the engine flags the recipe
 * incomplete via the join gap (we never fabricate its contribution, S-5).
 */
function buildEngineLines(
  recipe: RecipeDetail,
  byId: Map<string, SavedIngredient>,
): NutritionLine[] {
  return recipe.ingredients.flatMap((usage) => {
    const ingredient = byId.get(usage.ingredientId);
    if (!ingredient) {
      return [];
    }
    return [
      {
        quantity: usage.quantity,
        unitCode: usage.unitCode,
        ingredient: {
          id: ingredient.id,
          referenceGrams: ingredient.referenceGrams,
          gramEquivalents: ingredient.unitGramEquivalents,
          gramWeightPerQty: ingredient.gramWeightPerQty,
          nutrition: toEngineNutrition(ingredient.nutrition),
          absentMacros: absentMacrosOf(ingredient.nutrition),
        },
      },
    ];
  });
}

/**
 * The recipe-backed body: notes/link from the recipe detail plus a per-serving
 * nutrition breakdown computed via the shared engine. Reads are TanStack Query
 * (cached/deduped, AD-4): the recipe detail by id and the ingredient list for
 * nutrition. Loading/error states are explicit so the panel is never blank.
 */
function RecipeMealBody({ recipeId }: { recipeId: string }): JSX.Element {
  const recipeQuery = useRecipeDetail(recipeId);
  const ingredientsQuery = useIngredients();

  const recipe = recipeQuery.data;
  const ingredients = ingredientsQuery.data;

  // Compose the nutrition only once both reads are in. The engine is the single
  // source of truth; useMemo keeps it cheap without caching a rounded copy.
  const nutrition = useMemo(() => {
    if (!recipe || !ingredients) {
      return null;
    }
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const lines = buildEngineLines(recipe, byId);
    // An ingredient referenced by the recipe but absent from the list cannot be
    // computed; flag the recipe incomplete rather than understating the total.
    const missingIngredient =
      lines.length < recipe.ingredients.length;
    const result = computeRecipeNutrition(lines, recipe.servings);
    return {
      perServing: formatNutrition(result.perServing),
      complete: result.completeness.complete && !missingIngredient,
    };
  }, [recipe, ingredients]);

  if (recipeQuery.isLoading) {
    return <p role="status">Loading recipe details...</p>;
  }
  if (recipeQuery.isError) {
    return (
      <p role="alert">
        Could not load this recipe:{' '}
        {recipeQuery.error?.message ?? 'unknown error'}
      </p>
    );
  }
  if (!recipe) {
    return <p role="alert">Recipe not found.</p>;
  }

  return (
    <>
      <h3>{recipe.name}</h3>
      {recipe.notes ? <p className="planned-meal-detail__notes">{recipe.notes}</p> : null}
      {recipe.sourceLink ? (
        <p>
          <a href={recipe.sourceLink}>Recipe link</a>
        </p>
      ) : null}

      <section aria-label="Per-serving nutrition">
        <h4>Per serving</h4>
        {ingredientsQuery.isLoading ? (
          <p role="status">Computing nutrition...</p>
        ) : !nutrition ? (
          <p role="alert">
            Could not load nutrition:{' '}
            {ingredientsQuery.error?.message ?? 'ingredient data unavailable'}
          </p>
        ) : (
          <>
            {!nutrition.complete ? (
              <p role="note" className="planned-meal-detail__incomplete">
                Nutrition is incomplete: some ingredients are missing data and
                are excluded from these totals (not counted as zero).
              </p>
            ) : null}
            <dl className="macro-bars">
              <MacroBar
                variant="calories"
                label="Calories"
                value={nutrition.perServing.calories}
                valueAriaLabel="Per-serving calories"
              />
              <MacroBar
                variant="protein"
                label="Protein (g)"
                value={nutrition.perServing.proteinG}
                valueAriaLabel="Per-serving protein"
              />
              <MacroBar
                variant="carbs"
                label="Carbs (g)"
                value={nutrition.perServing.carbsG}
                valueAriaLabel="Per-serving carbs"
              />
              <MacroBar
                variant="fat"
                label="Fat (g)"
                value={nutrition.perServing.fatG}
                valueAriaLabel="Per-serving fat"
              />
              <MacroBar
                variant="fiber"
                label="Fiber (g)"
                value={nutrition.perServing.fiberG}
                valueAriaLabel="Per-serving fiber"
              />
            </dl>
          </>
        )}
      </section>
    </>
  );
}

export function PlannedMealDetail({ entry }: PlannedMealDetailProps): JSX.Element {
  // Branch on the entry shape (AD-3). A freeform entry has freeformTitle; a
  // recipe-backed entry has recipeId; a tombstone has neither.
  const isFreeform = entry.freeformTitle != null;
  const isRecipe = entry.recipeId != null;

  return (
    <section
      aria-label="Meal detail"
      className="planned-meal-detail"
    >
      <p className="planned-meal-detail__slot">{entry.mealSlot}</p>

      {isFreeform ? (
        <>
          <h3>{entry.freeformTitle}</h3>
          {entry.freeformDescription ? (
            <p className="planned-meal-detail__notes">
              {entry.freeformDescription}
            </p>
          ) : null}
          {/* Render the link only when present so an absent link never produces
              a broken/empty anchor (AC-2.1). */}
          {entry.freeformLink ? (
            <p>
              <a href={entry.freeformLink}>Meal link</a>
            </p>
          ) : null}
        </>
      ) : isRecipe ? (
        <RecipeMealBody recipeId={entry.recipeId as string} />
      ) : (
        // recipe_id NULL + no freeform fields: the referenced recipe was deleted
        // (tombstone, AD-3). The slot is preserved; show a clear removed state
        // rather than crashing or rendering blank nutrition.
        <p className="planned-meal-detail__tombstone">
          Recipe removed. This meal&apos;s recipe was deleted from the library.
        </p>
      )}
    </section>
  );
}
