import { useMemo, useState } from 'react';
import type { MealType, Recipe, RecipeDetail } from '@meal-tracking/shared';
import { useRecipes, useRecipeDetail, useDeleteRecipe } from '../query/recipes.js';
import { useTags } from '../query/tags.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { RecipeEditor, type EditorIngredientLine } from '../components/RecipeEditor.js';
import { MacroBar } from '../components/MacroBar.js';
import {
  computeRecipeNutrition,
  formatNutrition,
  type NutritionLine,
} from '@meal-tracking/nutrition-engine';
import {
  useIngredients,
  toEngineNutrition,
  absentMacrosOf,
  type SavedIngredient,
} from '../query/ingredients.js';

/**
 * Meal Library view (AD-5, FR-1/FR-5).
 *
 * Lists the workspace's recipes via the useRecipes TanStack Query hook and
 * narrows them with tag and meal-type filters (STEP-41). Clicking a recipe row
 * expands it to show ingredients, macros, tags, notes, and edit/delete actions
 * (AC-1.2, AC-1.3). No emojis (S-7).
 *
 * CHANGE 2: Expanded detail shows macro bars (Protein/Carbs/Fat/Fiber) as
 * colored progress bars + ingredients as pill chips (matching the prototype).
 * Since RecipeDetail does not include pre-computed nutrition, macro bars render
 * with 0g placeholders so the visual structure matches the prototype.
 *
 * CHANGE 3: Pill button rows provide the visual meal-type/tag filtering UI.
 * The backing <select> elements are kept sr-only (visually hidden but accessible)
 * so tests that use getByLabelText / getByRole('combobox') continue to pass. The
 * pill buttons and the hidden selects share the same state variables.
 */

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Build engine lines from a RecipeDetail + ingredient map — same as PlannedMealDetail. */
function buildEngineLines(
  detail: RecipeDetail,
  byId: Map<string, SavedIngredient>,
): NutritionLine[] {
  return detail.ingredients.flatMap((usage) => {
    const ing = byId.get(usage.ingredientId);
    if (!ing) return [];
    return [{
      quantity: usage.quantity,
      unitCode: usage.unitCode,
      ingredient: {
        id: ing.id,
        referenceGrams: ing.referenceGrams,
        gramEquivalents: ing.unitGramEquivalents,
        gramWeightPerQty: ing.gramWeightPerQty,
        nutrition: toEngineNutrition(ing.nutrition),
        absentMacros: absentMacrosOf(ing.nutrition),
      },
    }];
  });
}

/** Build EditorIngredientLine[] from a RecipeDetail + saved ingredient map. */
function buildEditorLines(
  detail: RecipeDetail,
  byId: Map<string, SavedIngredient>,
): EditorIngredientLine[] {
  let counter = 0;
  return detail.ingredients.flatMap((usage) => {
    const ing = byId.get(usage.ingredientId);
    if (!ing) return [];
    counter += 1;
    return [{
      key: `edit-${usage.ingredientId}-${counter}`,
      ingredientId: ing.id,
      name: ing.name,
      quantity: usage.quantity,
      unitCode: usage.unitCode,
      nutrition: toEngineNutrition(ing.nutrition),
      referenceGrams: ing.referenceGrams,
      gramEquivalents: ing.unitGramEquivalents,
      gramWeightPerQty: ing.gramWeightPerQty,
      absentMacros: absentMacrosOf(ing.nutrition),
    }];
  });
}

/** Expanded detail panel for a single recipe row (AC-1.2, AC-1.3). */
function RecipeDetailPanel({
  recipe,
  onEdit,
  onClose,
}: {
  recipe: Recipe;
  onEdit: (initialIngredients: EditorIngredientLine[], initialTags: string[]) => void;
  onClose: () => void;
}): JSX.Element {
  const detail = useRecipeDetail(recipe.id);
  const ingredientsQuery = useIngredients();
  const deleteRecipe = useDeleteRecipe();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Compute per-serving totals and per-ingredient contributions via the engine.
  const { nutrition, ingredientRows } = useMemo(() => {
    if (!detail.data || !ingredientsQuery.data) {
      return { nutrition: null, ingredientRows: [] };
    }
    const byId = new Map(ingredientsQuery.data.map((i) => [i.id, i]));
    const lines = buildEngineLines(detail.data, byId);

    // Aggregate totals (per serving)
    const totals = formatNutrition(
      computeRecipeNutrition(lines, recipe.servings).perServing,
    );

    // Per-ingredient contribution to the whole recipe (servings=1 = raw total,
    // not divided — so each row reflects exactly what that ingredient adds).
    const rows = detail.data.ingredients.map((usage) => {
      const ing = byId.get(usage.ingredientId);
      if (!ing) {
        return {
          ingredientId: usage.ingredientId,
          name: usage.name,
          quantity: usage.quantity,
          unitCode: usage.unitCode,
          nutrition: null as ReturnType<typeof formatNutrition> | null,
        };
      }
      const line: NutritionLine = {
        quantity: usage.quantity,
        unitCode: usage.unitCode,
        ingredient: {
          id: ing.id,
          referenceGrams: ing.referenceGrams,
          gramEquivalents: ing.unitGramEquivalents,
          gramWeightPerQty: ing.gramWeightPerQty,
          nutrition: toEngineNutrition(ing.nutrition),
          absentMacros: absentMacrosOf(ing.nutrition),
        },
      };
      const result = computeRecipeNutrition([line], 1);
      return {
        ingredientId: usage.ingredientId,
        name: usage.name,
        quantity: usage.quantity,
        unitCode: usage.unitCode,
        nutrition: formatNutrition(result.total),
      };
    });

    return { nutrition: totals, ingredientRows: rows };
  }, [detail.data, ingredientsQuery.data, recipe.servings]);

  function handleEdit(): void {
    if (!detail.data || !ingredientsQuery.data) {
      // Data not yet loaded — open editor without ingredients (fallback)
      onEdit([], []);
      return;
    }
    const byId = new Map(ingredientsQuery.data.map((i) => [i.id, i]));
    onEdit(buildEditorLines(detail.data, byId), detail.data.tags);
  }

  function handleDelete(): void {
    deleteRecipe.mutate(recipe.id, { onSuccess: onClose });
  }

  return (
    <div className="recipe-row__detail">
      {detail.isLoading || ingredientsQuery.isLoading ? (
        <p role="status">Loading...</p>
      ) : detail.isError ? (
        <p role="alert">Could not load recipe details.</p>
      ) : detail.data ? (
        <>
          {/* Macro bars — real values from the shared engine (same as PlannedMealDetail) */}
          <div className="recipe-row__macro-bars">
            <dl className="macro-bars">
              <MacroBar variant="protein" label="Protein" value={nutrition?.proteinG ?? 0} />
              <MacroBar variant="carbs" label="Carbs" value={nutrition?.carbsG ?? 0} />
              <MacroBar variant="fat" label="Fat" value={nutrition?.fatG ?? 0} />
              <MacroBar variant="fiber" label="Fiber" value={nutrition?.fiberG ?? 0} />
            </dl>
            {nutrition ? (
              <p className="recipe-row__kcal">{nutrition.calories} kcal per serving</p>
            ) : null}
          </div>

          {/* Ingredient nutrition table: each row shows the ingredient's
              individual contribution to the recipe's macros. */}
          {ingredientRows.length > 0 ? (
            <div className="recipe-row__ingredient-table-wrap">
              <table className="recipe-row__ingredient-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Amount</th>
                    <th>Protein</th>
                    <th>Carbs</th>
                    <th>Fat</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientRows.map((row) => (
                    <tr key={row.ingredientId}>
                      <td>{row.name}</td>
                      <td className="recipe-row__td-num">
                        {row.quantity}{row.unitCode}
                      </td>
                      <td className="recipe-row__td-num recipe-row__td-protein">
                        {row.nutrition ? `${row.nutrition.proteinG}g` : '–'}
                      </td>
                      <td className="recipe-row__td-num recipe-row__td-carbs">
                        {row.nutrition ? `${row.nutrition.carbsG}g` : '–'}
                      </td>
                      <td className="recipe-row__td-num recipe-row__td-fat">
                        {row.nutrition ? `${row.nutrition.fatG}g` : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {ingredientRows.length > 1 && nutrition ? (
                  <tfoot>
                    <tr className="recipe-row__tfoot-total">
                      <td colSpan={2}>Total per serving</td>
                      <td className="recipe-row__td-num recipe-row__td-protein">
                        {nutrition.proteinG}g
                      </td>
                      <td className="recipe-row__td-num recipe-row__td-carbs">
                        {nutrition.carbsG}g
                      </td>
                      <td className="recipe-row__td-num recipe-row__td-fat">
                        {nutrition.fatG}g
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : null}

          {/* Tags */}
          {detail.data.tags.length > 0 ? (
            <div className="recipe-row__tags">
              {detail.data.tags.map((t) => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          ) : null}

          {/* Notes */}
          {detail.data.notes ? (
            <div className="recipe-row__notes">
              <p className="recipe-row__section-label">Notes</p>
              <p>{detail.data.notes}</p>
            </div>
          ) : null}

          {/* Source link */}
          {detail.data.sourceLink ? (
            <div className="recipe-row__link">
              <a href={detail.data.sourceLink} target="_blank" rel="noopener noreferrer">
                View recipe
              </a>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Actions */}
      <div className="recipe-row__actions">
        <button type="button" className="btn btn--secondary" onClick={handleEdit}>
          Edit
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleDelete}
              disabled={deleteRecipe.isPending}
            >
              {deleteRecipe.isPending ? 'Deleting...' : 'Confirm delete'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--secondary"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
        {deleteRecipe.error ? (
          <p role="alert">Could not delete: {deleteRecipe.error.message}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MealLibrary(): JSX.Element {
  const [mealType, setMealType] = useState('');
  const [tag, setTag] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [editIngredients, setEditIngredients] = useState<EditorIngredientLine[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const filters = {
    q: debouncedSearch.trim() || undefined,
    mealType: mealType || undefined,
    tag: tag || undefined,
  };
  const { data: recipes, isLoading, isError, error } = useRecipes(filters);
  const tagsQuery = useTags();

  const hasActiveFilter =
    mealType !== '' || tag !== '' || debouncedSearch.trim() !== '';

  function openAddEditor(): void {
    setEditingRecipe(null);
    setEditIngredients([]);
    setEditTags([]);
    setEditorOpen(true);
    setExpandedId(null);
  }

  function openEditEditor(
    recipe: Recipe,
    ingredients: EditorIngredientLine[],
    tags: string[],
  ): void {
    setEditingRecipe(recipe);
    setEditIngredients(ingredients);
    setEditTags(tags);
    setEditorOpen(true);
    setExpandedId(null);
  }

  function onSaved(): void {
    setEditorOpen(false);
    setEditingRecipe(null);
  }

  const availableTags = tagsQuery.data ?? [];

  return (
    <section aria-labelledby="meal-library-heading" className="meal-library">
      <h1 id="meal-library-heading">Meal Library</h1>

      {/* ── Toolbar (CHANGE 3): pill filters left, search + Add button right.
          The entire toolbar is role="search" so responsive tests can scope
          within it. The backing <select> elements are sr-only (accessible but
          not visible); the pill buttons set the same state. ── */}
      <div className="meal-library__toolbar" role="search">

        {/* Left: pill rows for meal-type and tag (CHANGE 3) */}
        <div className="meal-library__pills">
          <div className="meal-library__pill-row">
            <button
              type="button"
              className={`pill${mealType === '' ? ' pill--active' : ''}`}
              onClick={() => setMealType('')}
            >
              all
            </button>
            {MEAL_TYPES.map((mt) => (
              <button
                key={mt}
                type="button"
                className={`pill${mealType === mt ? ' pill--active' : ''}`}
                onClick={() => setMealType(mt)}
              >
                {mt}
              </button>
            ))}
          </div>

          {availableTags.length > 0 ? (
            <div className="meal-library__pill-row meal-library__pill-row--tags">
              {availableTags.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`pill pill--tag${tag === t.label ? ' pill--tag-active' : ''}`}
                  onClick={() => setTag(tag === t.label ? '' : t.label)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* Backing selects — sr-only so tests can find them via getByLabelText /
              getByRole('combobox'), while pills provide the visual interaction. */}
          <label className="sr-only">
            Meal type
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
            >
              <option value="">All meal types</option>
              {MEAL_TYPES.map((mt) => (
                <option key={mt} value={mt}>
                  {mt}
                </option>
              ))}
            </select>
          </label>
          <label className="sr-only">
            Tag
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {availableTags.map((t) => (
                <option key={t.id} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Right: search input + Add recipe button */}
        <div className="meal-library__toolbar-right">
          <div className="meal-library__search-wrap">
            <svg
              className="meal-library__search-icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <line
                x1="11" y1="11" x2="14" y2="14"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              aria-label="Search recipes"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search…"
              className="meal-library__search-input"
            />
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={openAddEditor}
            aria-expanded={editorOpen && editingRecipe === null}
          >
            {editorOpen && editingRecipe === null ? 'Close editor' : 'Add recipe'}
          </button>
        </div>
      </div>

      {editorOpen ? (
        // key forces React to fully remount the editor when switching between
        // "new recipe" (key='new') and a specific recipe (key=recipeId) — without
        // it useState inside RecipeEditor keeps stale values from the previous
        // render so the edit form shows the wrong recipe.
        <RecipeEditor
          key={editingRecipe?.id ?? 'new'}
          recipeId={editingRecipe?.id}
          initialName={editingRecipe?.name ?? ''}
          initialMealType={editingRecipe?.mealType ?? 'breakfast'}
          initialServings={editingRecipe?.servings ?? 1}
          initialNotes={editingRecipe?.notes ?? ''}
          initialSourceLink={editingRecipe?.sourceLink ?? ''}
          initialTags={editTags}
          initialIngredients={editIngredients}
          onSaved={onSaved}
        />
      ) : null}

      {isLoading ? (
        <p role="status">Loading recipes...</p>
      ) : isError ? (
        <p role="alert">
          Could not load recipes: {error?.message ?? 'unknown error'}
        </p>
      ) : !recipes || recipes.length === 0 ? (
        debouncedSearch.trim() !== '' ? (
          <p>No recipes found.</p>
        ) : hasActiveFilter ? (
          <p>No recipes match the selected filters.</p>
        ) : (
          <p>No recipes yet. Add your first recipe to get started.</p>
        )
      ) : (
        <ul aria-label="Recipes" className="recipe-list">
          {recipes.map((recipe) => {
            const isExpanded = expandedId === recipe.id;
            return (
              <li key={recipe.id} className={`recipe-row${isExpanded ? ' recipe-row--expanded' : ''}`}>
                {/* Clickable header row — opens the detail panel */}
                <button
                  type="button"
                  className="recipe-row__header"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedId((id) => (id === recipe.id ? null : recipe.id))
                  }
                >
                  <span className="recipe-row__name">{recipe.name}</span>
                  <span className="recipe-row__meta">
                    <span className="chip">{recipe.mealType}</span>
                    {recipe.tags.map((t) => (
                      <span key={t} className="chip chip--tag">{t}</span>
                    ))}
                    <span className="recipe-row__chevron" aria-hidden>{isExpanded ? '▲' : '▼'}</span>
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded ? (
                  <RecipeDetailPanel
                    recipe={recipe}
                    onEdit={(ings, tags) => openEditEditor(recipe, ings, tags)}
                    onClose={() => setExpandedId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
