import { useState } from 'react';
import type { MealType, Recipe } from '@meal-tracking/shared';
import { useRecipes } from '../query/recipes.js';
import { useTags } from '../query/tags.js';

/**
 * RecipePalette (FR-4, AD-5) — the LEFT panel of the Weekly Planner's edit mode.
 *
 * Lists the workspace's recipes for assignment to a day/slot and narrows them
 * with meal-type and tag filters. The filters set `mealType`/`tag` in the
 * useRecipes query KEY, so TanStack Query refetches the SERVER-filtered list
 * (recipe-library GET /recipes, AD-6) and caches per filter combination
 * (AC-4.2) — never client-side array filtering, so the palette stays consistent
 * and scales with the library.
 *
 * Each recipe is rendered through a `renderCard` prop so STEP-20 can wrap the
 * card in a dnd-kit draggable / tap-to-select affordance without this component
 * owning the drag wiring. Loading/error/empty states are explicit (never a
 * blank panel). No emojis (S-7).
 */
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface RecipePaletteProps {
  /**
   * Renders a single recipe card. STEP-20 supplies a draggable/tappable card;
   * the default is a plain, static card so the palette is usable on its own.
   */
  renderCard?: (recipe: Recipe) => JSX.Element;
}

function DefaultCard({ recipe }: { recipe: Recipe }): JSX.Element {
  return (
    <span>
      <span>{recipe.name}</span> <span>({recipe.mealType})</span>
    </span>
  );
}

export function RecipePalette({ renderCard }: RecipePaletteProps): JSX.Element {
  const [mealType, setMealType] = useState('');
  const [tag, setTag] = useState('');

  // Filters live in the query KEY so a new filter combination is a distinct
  // cache entry and a server-filtered refetch (AC-4.2, AD-6).
  const filters = {
    mealType: mealType || undefined,
    tag: tag || undefined,
  };
  const { data: recipes, isLoading, isError, error } = useRecipes(filters);
  const tagsQuery = useTags();

  const hasActiveFilter = mealType !== '' || tag !== '';

  return (
    <div>
      <div className="weekly-planner__palette-filters" role="search">
        <label>
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

        <label>
          Tag
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {(tagsQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.label}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p role="status">Loading recipes...</p>
      ) : isError ? (
        <p role="alert">
          Could not load recipes: {error?.message ?? 'unknown error'}
        </p>
      ) : !recipes || recipes.length === 0 ? (
        hasActiveFilter ? (
          <p>No recipes match the selected filters.</p>
        ) : (
          <p>No recipes yet. Add a recipe in the Meal Library.</p>
        )
      ) : (
        <ul aria-label="Palette recipes" className="weekly-planner__palette-list">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              {renderCard ? (
                renderCard(recipe)
              ) : (
                <DefaultCard recipe={recipe} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
