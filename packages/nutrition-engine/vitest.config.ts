import { defineConfig } from 'vitest/config';

// Vitest config for the pure nutrition engine. The engine imports only TYPES
// from @meal-tracking/shared (erased at runtime), but resolve the in-repo
// workspace to its TypeScript source via the "development" export condition so
// tests run against source without requiring a prior `tsc` build of
// shared/dist. The production runtime uses the default condition (compiled JS).
export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
});
