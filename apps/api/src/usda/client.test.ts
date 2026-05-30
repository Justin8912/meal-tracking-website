import { describe, it, expect, vi } from 'vitest';
import {
  createUsdaClient,
  UsdaError,
  USDA_ERROR_CODE,
  type UsdaFetch,
} from './client.js';

/**
 * STEP-19 client behavior (the mapper itself is covered by mapper.test.ts).
 *
 * The client must:
 *  - call USDA with the api_key from injected config (S-2) and NEVER expose it
 *    in any returned value;
 *  - query Foundation+SR Legacy first, falling back to Branded only when the
 *    primary search yields nothing (F-8);
 *  - normalize both endpoint shapes via the mapper to per-100g;
 *  - surface 429 / timeout / upstream failure as a typed UsdaError for the
 *    caller's degradation path (STEP-21).
 *
 * The real USDA API is never hit - fetch is stubbed with fixture payloads.
 */

const SEARCH_PAYLOAD = {
  foods: [
    {
      fdcId: 171705,
      description: 'Chicken breast, raw',
      dataType: 'SR Legacy',
      foodNutrients: [
        { nutrientNumber: '208', nutrientName: 'Energy', value: 120, unitName: 'KCAL' },
        { nutrientNumber: '203', nutrientName: 'Protein', value: 22.5, unitName: 'G' },
      ],
    },
  ],
};

const DETAIL_PAYLOAD = {
  fdcId: 171705,
  description: 'Chicken breast, raw',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrient: { number: '208', name: 'Energy', unitName: 'kcal' }, amount: 120 },
    { nutrient: { number: '203', name: 'Protein', unitName: 'g' }, amount: 22.5 },
  ],
};

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const CONFIG = {
  usdaApiKey: 'TEST_SECRET_KEY',
  usdaBaseUrl: 'https://usda.test/fdc/v1',
};

describe('USDA client (unit, stubbed fetch)', () => {
  it('searchFoods calls USDA with the api_key and returns normalized per-100g', async () => {
    const fetchImpl: UsdaFetch = vi.fn(async () => okResponse(SEARCH_PAYLOAD));
    const client = createUsdaClient({ ...CONFIG, fetchImpl });

    const results = await client.searchFoods('chicken');

    expect(results).toHaveLength(1);
    expect(results[0]!.fdcId).toBe('171705');
    expect(results[0]!.per100g.calories).toBe(120);
    expect(results[0]!.per100g.proteinG).toBe(22.5);

    // The request URL carried the key and the Foundation+SR dataType (F-8).
    const calledUrl = String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]);
    expect(calledUrl).toContain('api_key=TEST_SECRET_KEY');
    expect(calledUrl).toContain('Foundation');
    expect(calledUrl).toContain('SR+Legacy');

    // The key never appears in the normalized output.
    expect(JSON.stringify(results)).not.toContain('TEST_SECRET_KEY');
  });

  it('searchFoods falls back to Branded when the primary search is empty (F-8)', async () => {
    const fetchImpl = vi
      .fn<UsdaFetch>()
      .mockResolvedValueOnce(okResponse({ foods: [] }))
      .mockResolvedValueOnce(okResponse(SEARCH_PAYLOAD));
    const client = createUsdaClient({ ...CONFIG, fetchImpl });

    const results = await client.searchFoods('chicken');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain('Branded');
    expect(results).toHaveLength(1);
  });

  it('getFood returns the normalized detail (nested shape)', async () => {
    const fetchImpl: UsdaFetch = vi.fn(async () => okResponse(DETAIL_PAYLOAD));
    const client = createUsdaClient({ ...CONFIG, fetchImpl });

    const food = await client.getFood('171705');
    expect(food.fdcId).toBe('171705');
    expect(food.per100g.calories).toBe(120);
    expect(food.per100g.proteinG).toBe(22.5);
  });

  it('raises a typed UsdaError on a 429 (rate limit) without leaking the key', async () => {
    const fetchImpl: UsdaFetch = vi.fn(
      async () => new Response('rate limited', { status: 429 }),
    );
    const client = createUsdaClient({ ...CONFIG, fetchImpl });

    await expect(client.searchFoods('chicken')).rejects.toMatchObject({
      code: USDA_ERROR_CODE,
      rateLimited: true,
    });
    await expect(client.searchFoods('chicken')).rejects.toBeInstanceOf(UsdaError);
  });

  it('raises a typed UsdaError when fetch rejects (timeout/network)', async () => {
    const fetchImpl: UsdaFetch = vi.fn(async () => {
      throw new Error('connect ETIMEDOUT');
    });
    const client = createUsdaClient({ ...CONFIG, fetchImpl });

    const err = await client.searchFoods('chicken').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UsdaError);
    // The original network error message must not surface the key anywhere.
    expect(JSON.stringify((err as UsdaError).message)).not.toContain('TEST_SECRET_KEY');
  });

  it('throws a configuration UsdaError when no api_key is set (S-2)', async () => {
    const fetchImpl: UsdaFetch = vi.fn(async () => okResponse(SEARCH_PAYLOAD));
    const client = createUsdaClient({
      usdaApiKey: undefined,
      usdaBaseUrl: CONFIG.usdaBaseUrl,
      fetchImpl,
    });

    await expect(client.searchFoods('chicken')).rejects.toBeInstanceOf(UsdaError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
