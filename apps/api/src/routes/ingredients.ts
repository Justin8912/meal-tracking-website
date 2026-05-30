import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { micronutrientSchema } from '@meal-tracking/shared';
import type { Db } from '../db/client.js';
import { UsdaError, type UsdaClient } from '../usda/client.js';
import type { NormalizedFood } from '../usda/mapper.js';

/**
 * Ingredient routes (FR-2, FR-3, AD-3, AD-4).
 *
 * STEP-23 adds the USDA proxy: GET /ingredients/search and
 * GET /ingredients/usda/:fdcId call the cached USDA client server-side so the
 * browser never sees the api_key (AC-2.4). On the client's typed UsdaError the
 * shared error envelope is returned with a clear code (AC-2.3) so the UI can
 * offer custom entry. Responses are validated with Zod at the boundary (S-3).
 *
 * STEP-25 adds custom-ingredient create/list; STEP-27 adds USDA snapshot-at-add.
 */

/** Per-100g normalized nutrition; macros optional (absent = unknown, F-8/S-6). */
const per100gSchema = z.object({
  calories: z.number().optional(),
  proteinG: z.number().optional(),
  carbsG: z.number().optional(),
  fatG: z.number().optional(),
  fiberG: z.number().optional(),
  micronutrients: z.record(z.string(), micronutrientSchema),
});

/** A normalized USDA food as returned by the proxy (contracts.md). */
const normalizedFoodSchema = z.object({
  fdcId: z.string().min(1),
  description: z.string(),
  dataType: z.string(),
  per100g: per100gSchema,
});

const searchResultsSchema = z.array(normalizedFoodSchema);

const searchQuerySchema = z.object({
  q: z.string().min(1, 'q is required'),
});

/**
 * Map a typed UsdaError to the shared error envelope. Never include the key or
 * a stack; the global handler would otherwise log a 500 stack for an upstream
 * dependency failure (AC-2.3, AC-2.4).
 */
function sendUsdaError(reply: import('fastify').FastifyReply, err: UsdaError) {
  return reply.code(err.statusCode).send({
    error: {
      code: err.code,
      message: err.rateLimited
        ? 'The nutrition service is rate limited; please try again shortly.'
        : 'The nutrition service is currently unavailable.',
    },
  });
}

export function registerIngredientsRoutes(
  app: FastifyInstance,
  _db: Db,
  usda: UsdaClient,
): void {
  app.get('/ingredients/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid search query',
        },
      });
    }

    let results: NormalizedFood[];
    try {
      results = await usda.searchFoods(parsed.data.q);
    } catch (err) {
      if (err instanceof UsdaError) {
        return sendUsdaError(reply, err);
      }
      throw err;
    }

    const body = searchResultsSchema.parse(results);
    return reply.code(200).send(body);
  });

  app.get<{ Params: { fdcId: string } }>(
    '/ingredients/usda/:fdcId',
    async (request, reply) => {
      const { fdcId } = request.params;

      let food: NormalizedFood;
      try {
        food = await usda.getFood(fdcId);
      } catch (err) {
        if (err instanceof UsdaError) {
          return sendUsdaError(reply, err);
        }
        throw err;
      }

      const body = normalizedFoodSchema.parse(food);
      return reply.code(200).send(body);
    },
  );
}
