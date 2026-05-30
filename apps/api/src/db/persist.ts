import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from './client.js';
import { resolveWorkspaceId } from '../workspace.js';

/**
 * The write-path template every feature CRUD endpoint reuses (AD-7), and the
 * single place AC-1.1 / AC-1.5 are guaranteed.
 *
 * On success the record is committed server-side and the persisted row is
 * returned (AC-1.1). On ANY DB failure the helper throws a typed
 * PersistenceError - it never swallows the error, logs-and-continues, or
 * returns a partial/false success, which is exactly the silent data-loss
 * failure AC-1.5 guards against. The thrown error carries `statusCode = 500`
 * and a stable `code` so the Fastify global handler (STEP-9) serializes it into
 * the shared 5xx error envelope rather than a crash or HTML page.
 *
 * Writes are workspace-scoped: the workspace id is resolved server-side via
 * resolveWorkspaceId() (STEP-11, AD-4) and set on the inserted row, so callers
 * cannot write across tenants. The insert is a fully parameterized Drizzle
 * query (S-4) - user input is never concatenated into SQL.
 */

/** Stable error code surfaced in the shared envelope on a save failure. */
export const PERSISTENCE_ERROR_CODE = 'PERSISTENCE_FAILED';

/**
 * Typed error thrown when a server-side save fails. The `statusCode`/`code`
 * fields are read by the Fastify global error handler to build the shared 5xx
 * error envelope (AC-1.5).
 */
export class PersistenceError extends Error {
  /** Mapped to the HTTP status by the global handler (always 5xx). */
  readonly statusCode = 500;
  /** Stable machine-readable code in the error envelope. */
  readonly code = PERSISTENCE_ERROR_CODE;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PersistenceError';
  }
}

/**
 * A workspace-scoped table: any feature table that owns a `workspaceId` column
 * FKing to workspaces.id (AD-4). The helper only accepts such tables so the
 * tenant scoping is enforced at the type level.
 */
type WorkspaceScopedTable = PgTable & { workspaceId: PgColumn };

/**
 * Insert values minus the server-owned `workspaceId`, which the helper always
 * sets itself from the resolved workspace. Callers supply only their own
 * columns.
 */
type ScopedInsert<T extends WorkspaceScopedTable> = Omit<
  InferInsertModel<T>,
  'workspaceId'
>;

/**
 * Persist a single workspace-scoped record and return the committed row.
 *
 * @throws PersistenceError if the insert fails for any reason.
 */
export async function persist<T extends WorkspaceScopedTable>(
  db: Db,
  table: T,
  values: ScopedInsert<T>,
): Promise<InferSelectModel<T>> {
  try {
    const workspaceId = await resolveWorkspaceId(db);
    const insertValues = {
      ...values,
      workspaceId,
    } as InferInsertModel<T>;

    const rows = (await db
      .insert(table)
      .values(insertValues)
      .returning()) as Array<InferSelectModel<T>>;

    const row = rows[0];
    if (!row) {
      // A successful insert that returned nothing is itself a failure to
      // persist - surface it rather than reporting a false success.
      throw new PersistenceError('Insert returned no row');
    }
    return row;
  } catch (err) {
    if (err instanceof PersistenceError) {
      throw err;
    }
    throw new PersistenceError('Failed to persist record', { cause: err });
  }
}
