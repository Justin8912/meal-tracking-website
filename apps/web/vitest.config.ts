import { defineConfig } from 'vitest/config';

// Vitest config (AD-5 verify). Runs the API client unit test in jsdom so the test
// can inject window._env_ and assert the client targets the runtime URL (F-3).
// Kept separate from vite.config.ts to avoid a dual-vite type clash.
export default defineConfig({
  // Resolve @meal-tracking/shared to its TypeScript source via the package's
  // "development" export condition, matching vite.config.ts.
  resolve: {
    conditions: ['development'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
