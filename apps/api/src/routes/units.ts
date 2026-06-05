import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { unitSchema } from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import { units } from '../db/schema.js';

/**
 * GET /api/v1/units - the unit conversion reference set (AC-1.2, AC-1.3).
 *
 * Reads the seeded `units` rows from Postgres through the pooled Drizzle client
 * (NOT a hardcoded constant): returning the same server-side data for every
 * client is what proves persistence and cross-device consistency, and that the
 * seed survives a fresh process. This is the read-path template feature specs
 * follow.
 *
 * Postgres returns the `numeric` grams_per_unit column as a string (or null);
 * it is coerced to `number | null` and the array is validated against the
 * shared Zod `Unit` schema (S-3) before being sent, so the contract cannot
 * drift. The query is fully parameterized via Drizzle (S-4).
 */
const unitsResponseSchema = z.array(unitSchema);

export function registerUnitsRoute(app: FastifyInstance, db: Db): void {
  app.get('/units', async (_request, reply) => {
    const rows = await db
      .select({
        code: units.code,
        label: units.label,
        gramsPerUnit: units.gramsPerUnit,
      })
      .from(units);

    const serialized = rows.map((row) => ({
      code: row.code,
      label: row.label,
      // numeric arrives as a string from pg; null stays null (no zero-fill).
      gramsPerUnit: row.gramsPerUnit === null ? null : Number(row.gramsPerUnit),
    }));

    const body = unitsResponseSchema.parse(serialized);
    return reply.code(200).send(body);
  });
}
