import {
  createBrowserRouter,
  Navigate,
  NavLink,
  Outlet,
} from 'react-router-dom';
import { MealLibrary } from './views/MealLibrary.js';
import { WeeklyPlanner } from './views/WeeklyPlanner.js';
import { NutritionTrends } from './views/NutritionTrends.js';
import { IngredientLibrary } from './views/IngredientLibrary.js';
import { useRecipes } from './query/recipes.js';

/**
 * Application shell with two placeholder tabs (Meal Library, Weekly Planner).
 * Feature specs (recipe-library, weekly-planner) fill the views in. The SPA uses
 * the browser history router; nginx provides history fallback so deep links resolve
 * to index.html (AD-5).
 */
/** NavLink className: the shared tab class plus an active modifier (AD-5). */
function tabClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'app-nav__tab is-active' : 'app-nav__tab';
}

/**
 * The header's right-side count slot: a small accent dot plus the workspace's
 * recipe count, mirroring the prototype's "N recipes" label. The count comes
 * from the shared useRecipes query (cached with the Meal Library, so this adds
 * no extra fetch in practice); while it is loading or unavailable the dot is
 * still shown so the slot keeps its place.
 */
function HeaderRecipeCount(): JSX.Element {
  const { data: recipes } = useRecipes();
  const count = recipes?.length;
  return (
    <div className="app-header__meta">
      <span className="app-header__dot" aria-hidden />
      {count !== undefined ? (
        <span className="app-header__count">
          {count} {count === 1 ? 'recipe' : 'recipes'}
        </span>
      ) : null}
    </div>
  );
}

function AppLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__bar">
            <div className="app-header__brand">
              <span className="app-header__title">nourish</span>
              <span className="app-header__tagline">meal tracker</span>
            </div>
            <HeaderRecipeCount />
          </div>
          <nav aria-label="Primary" className="app-nav">
            <NavLink to="/library" className={tabClass}>
              Meal Library
            </NavLink>
            <NavLink to="/ingredients" className={tabClass}>
              Ingredient Library
            </NavLink>
            <NavLink to="/planner" className={tabClass}>
              Weekly Planner
            </NavLink>
            <NavLink to="/trends" className={tabClass}>
              Trends
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="app-main">
        <div className="panel">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/planner" replace /> },
      { path: 'library', element: <MealLibrary /> },
      { path: 'ingredients', element: <IngredientLibrary /> },
      { path: 'planner', element: <WeeklyPlanner /> },
      { path: 'trends', element: <NutritionTrends /> },
    ],
  },
]);
