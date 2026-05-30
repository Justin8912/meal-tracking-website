import { useRecipes } from '../query/recipes.js';

/**
 * Meal Library view (AD-5, FR-1). Fills the platform's placeholder tab and
 * proves the web->api read path: it lists the workspace's recipes from
 * GET /recipes via the useRecipes TanStack Query hook. Loading, error, and
 * empty states are shown explicitly (never a blank screen). Nutrition display
 * and the recipe editor arrive with the engine in later bundles.
 */
export function MealLibrary(): JSX.Element {
  const { data: recipes, isLoading, isError, error } = useRecipes();

  return (
    <section aria-labelledby="meal-library-heading">
      <h1 id="meal-library-heading">Meal Library</h1>

      {isLoading ? (
        <p role="status">Loading recipes...</p>
      ) : isError ? (
        <p role="alert">
          Could not load recipes: {error?.message ?? 'unknown error'}
        </p>
      ) : !recipes || recipes.length === 0 ? (
        <p>No recipes yet. Add your first recipe to get started.</p>
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
