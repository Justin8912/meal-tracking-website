import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  tagInputSchema,
  tagListSchema,
  tagSchema,
} from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import { tags, type TagRow } from '../db/schema.js';
import { PersistenceError } from '../db/persist.js';
import { resolveWorkspaceId } from '../workspace.js';

/**
 * Tag routes (FR-5, AD-2). Tags are workspace-scoped and unique by label
 * (UNIQUE(workspace_id,label)), so the filter list stays clean. Creation is an
 * idempotent upsert by label: re-posting an existing label returns the existing
 * row rather than creating a duplicate. Applying tags to a recipe (via the
 * recipe payload's `tags` array) reuses the same upsert so a tag created here
 * is immediately usable as a filter (AC-5.1 feeds AC-5.2). All queries are
 * parameterized Drizzle (S-4).
 */

/**
 * Upsert the given labels into the workspace's tags and return the resulting
 * rows (existing + newly created), de-duplicated by label. The insert relies on
 * the UNIQUE(workspace_id,label) constraint with ON CONFLICT DO NOTHING so it
 * is idempotent and race-tolerant; the rows are then read back so callers get a
 * stable id for every requested label. Runs against whatever Db/transaction
 * handle is passed so it composes inside the recipe write transaction.
 */
export async function upsertTagsByLabel(
  db: Db,
  workspaceId: string,
  labels: string[],
): Promise<TagRow[]> {
  // Normalize: trim, drop empties, de-duplicate (case-sensitive label match,
  // mirroring the UNIQUE constraint).
  const unique = Array.from(
    new Set(labels.map((l) => l.trim()).filter((l) => l.length > 0)),
  );
  if (unique.length === 0) {
    return [];
  }

  await db
    .insert(tags)
    .values(unique.map((label) => ({ workspaceId, label })))
    .onConflictDoNothing();

  return db
    .select()
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), inArray(tags.label, unique)));
}

function toTag(row: TagRow) {
  return { id: row.id, label: row.label };
}

export function registerTagsRoutes(app: FastifyInstance, db: Db): void {
  app.get('/tags', async (_request, reply) => {
    const workspaceId = await resolveWorkspaceId(db);
    const rows = await db
      .select()
      .from(tags)
      .where(eq(tags.workspaceId, workspaceId))
      .orderBy(asc(tags.label));
    const body = tagListSchema.parse(rows.map(toTag));
    return reply.code(200).send(body);
  });

  app.post('/tags', async (request, reply) => {
    const parsed = tagInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid tag payload',
        },
      });
    }

    const workspaceId = await resolveWorkspaceId(db);
    let rows: TagRow[];
    try {
      // Idempotent upsert by label; a duplicate label resolves to the existing
      // row (no second insert), surfaced as 200 rather than 201.
      rows = await upsertTagsByLabel(db, workspaceId, [parsed.data.label]);
    } catch (err) {
      throw new PersistenceError('Failed to persist tag', { cause: err });
    }
    const row = rows[0];
    if (!row) {
      throw new PersistenceError('Tag upsert returned no row');
    }
    const body = tagSchema.parse(toTag(row));
    return reply.code(201).send(body);
  });

  app.delete<{ Params: { id: string } }>('/tags/:id', async (request, reply) => {
    const workspaceId = await resolveWorkspaceId(db);
    const deleted = await db
      .delete(tags)
      .where(and(eq(tags.id, request.params.id), eq(tags.workspaceId, workspaceId)))
      .returning({ id: tags.id });
    if (!deleted[0]) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Tag not found' },
      });
    }
    return reply.code(204).send();
  });
}
