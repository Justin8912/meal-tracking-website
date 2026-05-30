import type { ErrorEnvelope } from '@meal-tracking/shared';

/**
 * API client (AD-5, F-3).
 *
 * The base URL is read from window._env_.API_BASE_URL at call time, NOT from
 * import.meta.env. env-config.js (rendered at container start) defines window._env_
 * before the app bundle loads, so one immutable image can target any API at runtime.
 * No secret is referenced here; only the public API base URL.
 */

/** Error thrown when the API returns a non-2xx response carrying the shared envelope. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Resolve the API base URL from runtime config. Throws if window._env_ was not
 * injected (env-config.js failed to load) so misconfiguration is loud, not silent.
 */
export function getApiBaseUrl(): string {
  const base = window._env_?.API_BASE_URL;
  if (!base) {
    throw new Error(
      'API_BASE_URL is not configured. env-config.js must define window._env_.API_BASE_URL.',
    );
  }
  // Normalize a single trailing slash so path joining is predictable.
  return base.replace(/\/+$/, '');
}

/** Join the runtime base URL with a request path. */
function buildUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object'
  );
}

/**
 * Perform a fetch against the runtime-configured API and parse the JSON body.
 * Non-2xx responses are surfaced as ApiError using the shared error envelope
 * (references/contracts.md) so callers can present AC-1.5 failures.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  const body: unknown = await response
    .json()
    .catch(() => undefined);

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message);
    }
    throw new ApiError(
      response.status,
      'UNKNOWN_ERROR',
      `Request to ${path} failed with status ${response.status}`,
    );
  }

  return body as T;
}

/** Liveness check against GET /healthz (NFR-4). */
export async function getHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/healthz');
}
