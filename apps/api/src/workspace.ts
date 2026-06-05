import { sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { workspaces } from './db/schema.js';
import { DEFAULT_WORKSPACE_ID } from './constants.js';

/**
 * Server-side workspace resolution (AD-4).
 *
 * FUTURE AUTH SEAM: this function is the single place that decides which
 * workspace a request operates on. Today there is no authentication, so it
 * resolves the one seeded default workspace. When auth is added, this is the
 * only function that changes - it will derive the workspace/user from a token
 * instead - so adding auth is an additive change, not a cross-route refactor.
 *
 * It reads the seeded row via a parameterized Drizzle query (S-4) and verifies
 * the known default id is present, returning that stable id. If the seed row is
 * somehow absent it throws, surfacing a misconfigured database loudly rather
 * than silently scoping writes to a null/unknown workspace.
 */
export async function resolveWorkspaceId(db: Db): Promise<string> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(sql`${workspaces.id} = ${DEFAULT_WORKSPACE_ID}`)
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error(
      `Default workspace ${DEFAULT_WORKSPACE_ID} is not seeded; apply 0001_baseline.sql`,
    );
  }
  return row.id;
}
