import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { usdaFoodCache } from '../db/schema.js';
import type { UsdaClient } from './client.js';
import type { NormalizedFood } from './mapper.js';

/**
 * Postgres cache-aside wrapper for the USDA client (AD-3, F-6, F-9).
 *
 * Reads through usda_food_cache (keyed by fdc_id for detail, by a hash of the
 * normalized query for search). On a fresh hit the cached payload is served and
 * USDA is NOT called (rate-limit protection, F-6). On a miss or a stale entry,
 * USDA is called and the normalized result is persisted (upsert). On USDA
 * failure the cache doubles as the degradation store: a stale entry is served
 * if present, otherwise the typed UsdaError propagates so the route returns the
 * shared error envelope and the UI steers to custom entry (F-9, AC-2.3).
 *
 * Serving stale on failure deliberately IGNORES the TTL: a stale answer beats a
 * hard failure for a read-only nutrition lookup.
 *
 * usda_food_cache stays a pure accelerator (AD-4, F-11): recipes never reference
 * it; clearing it only forces a re-fetch, never changes a saved ingredient.
 */

/** Default freshness window: 24h. A hit older than this re-validates via USDA. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Prefix marking a search-results cache entry in the shared fdc_id PK column. */
const SEARCH_KEY_PREFIX = 'search:';

export interface CachedUsdaClientOptions {
  /** Freshness window in ms; a hit older than this is treated as stale. */
  ttlMs?: number;
}

/** Stable cache key for a search query (normalized + hashed, F-9). */
function searchKey(query: string): string {
  const normalized = query.trim().toLowerCase();
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `${SEARCH_KEY_PREFIX}${hash}`;
}

interface CacheHit<T> {
  payload: T;
  fetchedAt: Date;
}

export function createCachedUsdaClient(
  db: Db,
  inner: UsdaClient,
  options: CachedUsdaClientOptions = {},
): UsdaClient {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  async function read<T>(key: string): Promise<CacheHit<T> | undefined> {
    const rows = await db
      .select({
        payload: usdaFoodCache.payload,
        fetchedAt: usdaFoodCache.fetchedAt,
      })
      .from(usdaFoodCache)
      .where(eq(usdaFoodCache.fdcId, key))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return { payload: row.payload as T, fetchedAt: row.fetchedAt };
  }

  async function write(key: string, payload: unknown): Promise<void> {
    // Parameterized upsert (S-4); refresh fetched_at on every store.
    await db
      .insert(usdaFoodCache)
      .values({ fdcId: key, payload, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: usdaFoodCache.fdcId,
        set: { payload, fetchedAt: sql`now()` },
      });
  }

  function isFresh(hit: CacheHit<unknown>): boolean {
    return Date.now() - hit.fetchedAt.getTime() < ttlMs;
  }

  /**
   * Read-through with stale-on-outage. On a fresh hit, return it. Otherwise
   * call USDA; on success persist + return; on failure serve stale if present,
   * else rethrow the typed error.
   */
  async function throughCache<T>(
    key: string,
    fetchFresh: () => Promise<T>,
  ): Promise<T> {
    const hit = await read<T>(key);
    if (hit && isFresh(hit)) {
      return hit.payload;
    }

    try {
      const fresh = await fetchFresh();
      await write(key, fresh);
      return fresh;
    } catch (err) {
      if (hit) {
        // Degradation store: a stale answer beats a hard failure (F-9).
        return hit.payload;
      }
      throw err;
    }
  }

  /**
   * Apply Atwater calorie derivation to a NormalizedFood. The cache stores
   * pre-serialized NormalizedFood objects, so the mapper's post-processing
   * doesn't run on cache hits. This ensures calories are always derived from
   * macros when the stored object lacks them — regardless of cache hit/miss.
   */
  function ensureCalories(food: NormalizedFood): NormalizedFood {
    const p = food.per100g;
    if (
      p.calories === undefined &&
      (p.proteinG !== undefined || p.carbsG !== undefined || p.fatG !== undefined)
    ) {
      const derived =
        (p.proteinG ?? 0) * 4 + (p.carbsG ?? 0) * 4 + (p.fatG ?? 0) * 9;
      return {
        ...food,
        per100g: {
          ...p,
          calories: Math.round(derived * 10) / 10,
        },
      };
    }
    return food;
  }

  return {
    async searchFoods(query: string): Promise<NormalizedFood[]> {
      const results = await throughCache(searchKey(query), () => inner.searchFoods(query));
      return results.map(ensureCalories);
    },
    async getFood(fdcId: string): Promise<NormalizedFood> {
      const food = await throughCache(fdcId, () => inner.getFood(fdcId));
      return ensureCalories(food);
    },
  };
}
