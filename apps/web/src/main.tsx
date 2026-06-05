import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router.js';
import './styles/global.css';

// One TanStack Query client for the app's server state (AD-5).
const queryClient = new QueryClient();

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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
