import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { planEntryInputSchema } from '@meal-tracking/shared';
import type { PlanEntry } from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import { planEntries, type PlanEntryRow } from '../db/schema.js';
import { PersistenceError } from '../db/persist.js';
import { resolveWorkspaceId } from '../workspace.js';

/**
 * Weekly-plan routes (FR-1, FR-3; AD-1..AD-4).
 *
 * Bundle 1 ships the thin add/list round-trip; full CRUD, navigation, the
 * detail view, and the weekly summary land in later bundles. Writes are scoped
 * to the workspace via resolveWorkspaceId() (platform AD-4), validated by the
 * shared Zod schema incl. the recipe/freeform XOR (S-1), and persisted via
 * parameterized Drizzle queries (S-2). weekStart is normalized to the Monday
 * DATE server-side (AD-2, S-4) so the query is robust to any in-week date and
 * there is no ISO/year-boundary bug.
 *
 * On any write failure a PersistenceError is thrown so the global handler emits
 * the shared 5xx envelope rather than a false success (AC-1.6).
 */

/** GET /plans query params: a required weekStart in YYYY-MM-DD form. */
const planQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be YYYY-MM-DD'),
});

/**
 * Normalize any YYYY-MM-DD date to the Monday DATE of its week (AD-2, S-4).
 *
 * The date is parsed at UTC midnight so the computation is timezone-independent
 * (a DATE has no time/zone); JS getUTCDay() returns 0 (Sunday)..6 (Saturday),
 * which we remap to an offset back to Monday. The result is re-serialized as
 * YYYY-MM-DD. This never produces a YYYY-Www string, so the prototype's
 * year-boundary bug (F-11) cannot occur.
 */
export function normalizeToMonday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sunday..6=Saturday
  // Days to subtract to reach Monday: Sunday(0) -> 6, Monday(1) -> 0, etc.
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Map a persisted plan-entry DB row to the shared PlanEntry response shape. */
function toPlanEntry(row: PlanEntryRow): PlanEntry {
  return {
    id: row.id,
    // The `date` column comes back as a YYYY-MM-DD string from pg.
    weekStartDate: row.weekStartDate,
    dayOfWeek: row.dayOfWeek,
    mealSlot: row.mealSlot,
    position: row.position,
    recipeId: row.recipeId,
    freeformTitle: row.freeformTitle,
    freeformDescription: row.freeformDescription,
    freeformLink: row.freeformLink,
  };
}

export function registerPlansRoutes(app: FastifyInstance, db: Db): void {
  app.post('/plans', async (request, reply) => {
    const parsed = planEntryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      // Surface validation failures (incl. the XOR) as a 400 envelope (S-1).
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid plan payload',
        },
      });
    }

    const input = parsed.data;
    const workspaceId = await resolveWorkspaceId(db);
    // Derive the Monday server-side from whatever in-week date was sent (AD-2).
    const weekStartDate = normalizeToMonday(input.weekStart);

    let createdId: string;
    try {
      const inserted = await db
        .insert(planEntries)
        .values({
          workspaceId,
          weekStartDate,
          dayOfWeek: input.dayOfWeek,
          mealSlot: input.mealSlot,
          position: input.position ?? 0,
          recipeId: input.recipeId ?? null,
          freeformTitle: input.freeformTitle ?? null,
          freeformDescription: input.freeformDescription ?? null,
          freeformLink: input.freeformLink ?? null,
        })
        .returning({ id: planEntries.id });
      const id = inserted[0]?.id;
      if (!id) {
        throw new PersistenceError('Plan entry insert returned no row');
      }
      createdId = id;
    } catch (err) {
      if (err instanceof PersistenceError) throw err;
      throw new PersistenceError('Failed to persist plan entry', { cause: err });
    }

    // Return the persisted row (read back), not the request echo, so the
    // response confirms persistence (incl. the normalized week_start_date).
    const rows = await db
      .select()
      .from(planEntries)
      .where(
        and(
          eq(planEntries.id, createdId),
          eq(planEntries.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PersistenceError('Plan entry vanished immediately after insert');
    }
    return reply.code(201).send(toPlanEntry(row));
  });

  app.put<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    const parsed = planEntryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      // Surface validation failures (incl. the XOR on edit) as a 400 envelope
      // (S-1) so a malformed edit is rejected before it reaches the DB.
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid plan payload',
        },
      });
    }

    const input = parsed.data;
    const id = request.params.id;
    const workspaceId = await resolveWorkspaceId(db);

    // Confirm the entry exists in this workspace before mutating (404 vs a
    // silent no-op update); the lookup is workspace-scoped (AD-4).
    const existing = await db
      .select({ id: planEntries.id })
      .from(planEntries)
      .where(and(eq(planEntries.id, id), eq(planEntries.workspaceId, workspaceId)))
      .limit(1);
    if (!existing[0]) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Plan entry not found' },
      });
    }

    // Derive the Monday server-side from whatever in-week date was sent (AD-2).
    const weekStartDate = normalizeToMonday(input.weekStart);

    try {
      // The XOR guarantees exactly one of recipeId/freeformTitle is set; fully
      // replace both sides so an edit that switches kind clears the other.
      const updated = await db
        .update(planEntries)
        .set({
          weekStartDate,
          dayOfWeek: input.dayOfWeek,
          mealSlot: input.mealSlot,
          position: input.position ?? 0,
          recipeId: input.recipeId ?? null,
          freeformTitle: input.freeformTitle ?? null,
          freeformDescription: input.freeformDescription ?? null,
          freeformLink: input.freeformLink ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(planEntries.id, id), eq(planEntries.workspaceId, workspaceId)),
        )
        .returning({ id: planEntries.id });
      if (!updated[0]) {
        throw new PersistenceError('Plan entry update returned no row');
      }
    } catch (err) {
      if (err instanceof PersistenceError) throw err;
      throw new PersistenceError('Failed to update plan entry', { cause: err });
    }

    // Read the persisted row back so the response confirms persistence.
    const rows = await db
      .select()
      .from(planEntries)
      .where(
        and(eq(planEntries.id, id), eq(planEntries.workspaceId, workspaceId)),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PersistenceError('Plan entry vanished immediately after update');
    }
    return reply.code(200).send(toPlanEntry(row));
  });

  app.delete<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    const workspaceId = await resolveWorkspaceId(db);
    let deletedId: string | undefined;
    try {
      const deleted = await db
        .delete(planEntries)
        .where(
          and(
            eq(planEntries.id, request.params.id),
            eq(planEntries.workspaceId, workspaceId),
          ),
        )
        .returning({ id: planEntries.id });
      deletedId = deleted[0]?.id;
    } catch (err) {
      throw new PersistenceError('Failed to delete plan entry', { cause: err });
    }

    if (!deletedId) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Plan entry not found' },
      });
    }
    return reply.code(204).send();
  });

  app.get('/plans', async (request, reply) => {
    const parsedQuery = planQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            parsedQuery.error.issues[0]?.message ?? 'Invalid query parameters',
        },
      });
    }

    const workspaceId = await resolveWorkspaceId(db);
    // Normalize to the Monday so any in-week date returns the right week (AD-2).
    const weekStartDate = normalizeToMonday(parsedQuery.data.weekStart);

    const rows = await db
      .select()
      .from(planEntries)
      .where(
        and(
          eq(planEntries.workspaceId, workspaceId),
          eq(planEntries.weekStartDate, weekStartDate),
        ),
      )
      .orderBy(asc(planEntries.dayOfWeek), asc(planEntries.position));

    return reply.code(200).send(rows.map(toPlanEntry));
  });
}
