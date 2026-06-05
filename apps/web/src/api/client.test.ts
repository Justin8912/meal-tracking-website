import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getApiBaseUrl, getHealth, ApiError } from './client.js';

/**
 * STEP-12 verify: with window._env_ injected, the API client must target that
 * runtime URL (not a build-time-baked value). Proves the AD-5 / F-3 contract.
 */
describe('api client runtime configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window._env_;
  });

  it('reads the base URL from window._env_ at runtime', () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    expect(getApiBaseUrl()).toBe('http://x');
  });

  it('targets the injected runtime URL when fetching', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const result = await getHealth();

    expect(result).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(calledUrl).toBe('http://x/healthz');
  });

  it('normalizes a trailing slash on the base URL', async () => {
    window._env_ = { API_BASE_URL: 'http://api:3000/' };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await apiFetch('/healthz');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api:3000/healthz');
  });

  it('throws when window._env_ is not injected', () => {
    delete window._env_;
    expect(() => getApiBaseUrl()).toThrow(/API_BASE_URL is not configured/);
  });

  it('surfaces the shared error envelope as ApiError on non-2xx', async () => {
    window._env_ = { API_BASE_URL: 'http://x' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(apiFetch('/healthz')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'INTERNAL_ERROR',
    });
    await expect(apiFetch('/healthz')).rejects.toBeInstanceOf(ApiError);
  });
});
