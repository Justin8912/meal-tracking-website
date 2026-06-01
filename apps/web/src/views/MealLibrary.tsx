import { useState } from 'react';
import type { MealType, Recipe } from '@meal-tracking/shared';
import { useRecipes, useRecipeDetail, useDeleteRecipe } from '../query/recipes.js';
import { useTags } from '../query/tags.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { RecipeEditor } from '../components/RecipeEditor.js';

/**
 * Meal Library view (AD-5, FR-1/FR-5).
 *
 * Lists the workspace's recipes via the useRecipes TanStack Query hook and
 * narrows them with tag and meal-type filters (STEP-41). Clicking a recipe row
 * expands it to show ingredients, macros, tags, notes, and edit/delete actions
 * (AC-1.2, AC-1.3). No emojis (S-7).
 */
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Expanded detail panel for a single recipe row (AC-1.2, AC-1.3). */
function RecipeDetailPanel({
  recipe,
  onEdit,
  onClose,
}: {
  recipe: Recipe;
  onEdit: () => void;
  onClose: () => void;
}): JSX.Element {
  const detail = useRecipeDetail(recipe.id);
  const deleteRecipe = useDeleteRecipe();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete(): void {
    deleteRecipe.mutate(recipe.id, { onSuccess: onClose });
  }

  return (
    <div className="recipe-row__detail">
      {detail.isLoading ? (
        <p role="status">Loading...</p>
      ) : detail.isError ? (
        <p role="alert">Could not load recipe details.</p>
      ) : detail.data ? (
        <>
          {/* Ingredients list */}
          {detail.data.ingredients.length > 0 ? (
            <div className="recipe-row__ingredients">
              <p className="recipe-row__section-label">Ingredients</p>
              <ul>
                {detail.data.ingredients.map((ing) => (
                  <li key={ing.ingredientId}>
                    {ing.quantity}{ing.unitCode} {ing.name}
                  </li>
                ))}
              </ul>
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
        <button type="button" className="btn btn--secondary" onClick={onEdit}>
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
    setEditorOpen(true);
    setExpandedId(null);
  }

  function openEditEditor(recipe: Recipe): void {
    setEditingRecipe(recipe);
    setEditorOpen(true);
    setExpandedId(null);
  }

  function onSaved(): void {
    setEditorOpen(false);
    setEditingRecipe(null);
  }

  return (
    <section aria-labelledby="meal-library-heading" className="meal-library">
      <h1 id="meal-library-heading">Meal Library</h1>

      <button
        type="button"
        onClick={openAddEditor}
        aria-expanded={editorOpen && editingRecipe === null}
      >
        {editorOpen && editingRecipe === null ? 'Close editor' : 'Add recipe'}
      </button>

      {editorOpen ? (
        <RecipeEditor
          recipeId={editingRecipe?.id}
          onSaved={onSaved}
        />
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
                    <span className="recipe-row__servings">{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</span>
                    <span className="recipe-row__chevron" aria-hidden>{isExpanded ? '▲' : '▼'}</span>
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded ? (
                  <RecipeDetailPanel
                    recipe={recipe}
                    onEdit={() => openEditEditor(recipe)}
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
