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
function AppLayout(): JSX.Element {
  return (
    <div>
      <header>
        <nav aria-label="Primary">
          <NavLink to="/library">Meal Library</NavLink>
          <NavLink to="/planner">Weekly Planner</NavLink>
        </nav>
      </header>
      <main>
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
