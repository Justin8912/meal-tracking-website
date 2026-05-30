import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';

/**
 * React entry point. By the time this bundle executes, env-config.js has already
 * run (it is loaded before this module in index.html), so window._env_ is defined
 * for the API client (AD-5).
 */
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
