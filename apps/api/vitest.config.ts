import { defineConfig } from 'vitest/config';

// Vitest config for the API. Resolve the in-repo @meal-tracking/shared workspace
// to its TypeScript source via the package's "development" export condition, so
// tests run against source without requiring a prior `tsc` build of shared/dist.
// The production runtime (node dist/server.js) uses the default condition and
// loads compiled JS instead.
export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
  test: {
    // Integration tests share one Postgres via the process-singleton pool
    // (db/client.ts). Run test files serially so concurrent files do not
    // interleave writes/DDL against the same tables. Within a file, tests
    // already run in order.
    fileParallelism: false,
  },
});
