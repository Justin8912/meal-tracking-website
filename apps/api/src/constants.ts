/**
 * The fixed UUID of the single seeded default workspace (AD-4).
 *
 * This value MUST match the workspace id seeded in
 * apps/api/drizzle/0001_baseline.sql. The server-side workspace resolver
 * returns this id until authentication exists; feature migrations reference it.
 */
export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
