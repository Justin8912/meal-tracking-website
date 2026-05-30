import {
  mapSearchFood,
  mapDetailFood,
  type NormalizedFood,
} from './mapper.js';

/**
 * USDA FoodData Central client (AD-3, F-6, F-7, F-8).
 *
 * All USDA calls go through here, server-side, with the api_key supplied from
 * runtime config (S-2) - it is never client-exposed and never returned in any
 * value this module produces. Search queries Foundation + SR Legacy first for
 * complete per-100g data and falls back to Branded only when the primary search
 * is empty (F-8). Both endpoint shapes are normalized by stable nutrient number
 * (mapper.ts).
 *
 * Upstream failure (429 rate limit, timeout, network error, non-2xx) is raised
 * as a typed UsdaError so the cache-aside layer (STEP-21) can serve stale data
 * or the route can return the shared error envelope (AC-2.3). The error message
 * never contains the key or the keyed URL.
 */

/** Stable error code surfaced in the shared envelope on a USDA failure. */
export const USDA_ERROR_CODE = 'USDA_UNAVAILABLE';

/** Typed error for any USDA upstream failure (AD-3 degradation path). */
export class UsdaError extends Error {
  readonly code = USDA_ERROR_CODE;
  /** HTTP status surfaced to the client (502 - upstream dependency failed). */
  readonly statusCode = 502;
  /** True when the failure was a 429 rate limit (F-6 backoff signal). */
  readonly rateLimited: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; rateLimited?: boolean },
  ) {
    super(message, options);
    this.name = 'UsdaError';
    this.rateLimited = options?.rateLimited ?? false;
  }
}

/** Injectable fetch (defaults to global fetch); lets tests stub the upstream. */
export type UsdaFetch = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<Response>;

export interface UsdaClientConfig {
  usdaApiKey: string | undefined;
  usdaBaseUrl: string;
  fetchImpl?: UsdaFetch;
  /** Per-request timeout in ms (default 8000). */
  timeoutMs?: number;
}

export interface UsdaClient {
  searchFoods(query: string): Promise<NormalizedFood[]>;
  getFood(fdcId: string): Promise<NormalizedFood>;
}

const PRIMARY_DATATYPES = ['Foundation', 'SR Legacy'];
const FALLBACK_DATATYPES = ['Branded'];

interface SearchResponse {
  foods?: unknown[];
}

export function createUsdaClient(config: UsdaClientConfig): UsdaClient {
  const fetchImpl: UsdaFetch =
    config.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = config.timeoutMs ?? 8000;

  function requireKey(): string {
    if (!config.usdaApiKey) {
      // S-2: the key is mandatory for a live call; surface as a typed error so
      // the route degrades to cache/custom entry rather than calling with no key.
      throw new UsdaError('USDA API key is not configured');
    }
    return config.usdaApiKey;
  }

  /** Build a USDA URL with the key as a query param (F-6). Never logged. */
  function buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`${config.usdaBaseUrl}${path}`);
    url.searchParams.set('api_key', requireKey());
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  /** Fetch + parse JSON, mapping any failure to a typed UsdaError. */
  async function fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: controller.signal });
    } catch (err) {
      // Network/timeout. Do NOT include the URL (it carries the key).
      throw new UsdaError('USDA request failed', { cause: err });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      throw new UsdaError('USDA rate limit exceeded', { rateLimited: true });
    }
    if (!res.ok) {
      throw new UsdaError(`USDA responded with status ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new UsdaError('USDA returned an unparseable response', {
        cause: err,
      });
    }
  }

  async function searchByDataTypes(
    query: string,
    dataTypes: string[],
  ): Promise<NormalizedFood[]> {
    const url = buildUrl('/foods/search', {
      query,
      dataType: dataTypes.join(','),
      pageSize: '25',
    });
    const body = (await fetchJson(url)) as SearchResponse;
    const foods = Array.isArray(body.foods) ? body.foods : [];
    return foods.map((f) => mapSearchFood(f as never));
  }

  return {
    async searchFoods(query: string): Promise<NormalizedFood[]> {
      const primary = await searchByDataTypes(query, PRIMARY_DATATYPES);
      if (primary.length > 0) {
        return primary;
      }
      // Fall back to Branded only when Foundation+SR find nothing (F-8).
      return searchByDataTypes(query, FALLBACK_DATATYPES);
    },

    async getFood(fdcId: string): Promise<NormalizedFood> {
      const url = buildUrl(`/food/${encodeURIComponent(fdcId)}`, {});
      const body = await fetchJson(url);
      return mapDetailFood(body as never);
    },
  };
}
