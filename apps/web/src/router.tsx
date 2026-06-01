import {
  createBrowserRouter,
  Navigate,
  NavLink,
  Outlet,
} from 'react-router-dom';
import { MealLibrary } from './views/MealLibrary.js';
import { WeeklyPlanner } from './views/WeeklyPlanner.js';

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

function AppLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand">
            <span className="app-header__title">nourish</span>
            <span className="app-header__tagline">meal tracker</span>
          </div>
          <nav aria-label="Primary" className="app-nav">
            <NavLink to="/library" className={tabClass}>
              Meal Library
            </NavLink>
            <NavLink to="/planner" className={tabClass}>
              Weekly Planner
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/library" replace /> },
      { path: 'library', element: <MealLibrary /> },
      { path: 'planner', element: <WeeklyPlanner /> },
    ],
  },
]);
