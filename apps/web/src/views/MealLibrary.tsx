import { useState } from 'react';
import type { MealType } from '@meal-tracking/shared';
import { useRecipes } from '../query/recipes.js';
import { useTags } from '../query/tags.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { RecipeEditor } from '../components/RecipeEditor.js';

/**
 * Meal Library view (AD-5, FR-1/FR-5).
 *
 * Lists the workspace's recipes via the useRecipes TanStack Query hook and
 * narrows them with tag and meal-type filters (STEP-41). The filters set
 * `tag`/`mealType` in the query KEY so TanStack Query refetches the
 * server-filtered list (Bundle 4) and caches per filter combination (AC-5.2/
 * 5.3) — never client-side array filtering. Loading, error, and empty states
 * are explicit (never a blank screen). Controls are stacked and full-width so
 * they remain usable on a phone (NFR-2). No emojis (S-7).
 */
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function MealLibrary(): JSX.Element {
  const [mealType, setMealType] = useState('');
  const [tag, setTag] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  // Debounce the search term so a TanStack Query key only changes after the
  // user pauses (AC-6.1) rather than firing a request per keystroke (AD-5).
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

  return (
    <section aria-labelledby="meal-library-heading">
      <h1 id="meal-library-heading">Meal Library</h1>

      <button
        type="button"
        onClick={() => setEditorOpen((open) => !open)}
        aria-expanded={editorOpen}
      >
        {editorOpen ? 'Close editor' : 'Add recipe'}
      </button>

      {editorOpen ? (
        // On save the mutation invalidates ['recipes'], so closing the editor
        // returns to a freshly-refetched list with the new recipe (AC-1.1).
        <RecipeEditor onSaved={() => setEditorOpen(false)} />
      ) : null}

      <div className="meal-library__filters" role="search">
        <label>
          Search recipes
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name"
          />
        </label>

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
        debouncedSearch.trim() !== '' ? (
          <p>No recipes found.</p>
        ) : hasActiveFilter ? (
          <p>No recipes match the selected filters.</p>
        ) : (
          <p>No recipes yet. Add your first recipe to get started.</p>
        )
      ) : (
        <ul aria-label="Recipes">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <span>{recipe.name}</span>
              <span> ({recipe.mealType})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
