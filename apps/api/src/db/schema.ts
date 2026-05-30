import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Baseline Drizzle schema owned by the platform foundation (AD-3).
 *
 * These two tables are the foundation every feature table builds on. Feature
 * specs add their own tables in later migrations and FK to `workspaces.id`
 * (AD-4); they must not redefine these.
 */

/**
 * The auth-ready tenant table (AD-4). The MVP seeds exactly one default row
 * with a fixed UUID so feature migrations and the server-side workspace
 * resolver can reference it.
 */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The unit conversion reference set. `gramsPerUnit` is NULL for count-based
 * units such as `qty` that have no mass conversion.
 */
export const units = pgTable('units', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  gramsPerUnit: numeric('grams_per_unit'),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type UnitRow = typeof units.$inferSelect;
