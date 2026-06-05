import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration (AD-3, S-5).
 *
 * Migrations are plain versioned SQL files under ./drizzle, beginning with the
 * foundation-owned baseline 0001_baseline.sql. The connection string comes only
 * from the environment (S-1).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
