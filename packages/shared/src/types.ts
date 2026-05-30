/**
 * Shared domain types for the meal-tracking platform.
 *
 * These types are the single source of truth for the API contract and are
 * imported by both apps/api and apps/web (S-3). They mirror the baseline
 * database schema (workspaces, units) and the shared error envelope defined
 * in references/contracts.md.
 */

/**
 * A workspace is the auth-ready tenant boundary (AD-4). In the MVP there is
 * exactly one seeded default workspace; every owned record FKs to it.
 */
export interface Workspace {
  id: string;
  name: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * A measurement unit in the conversion reference set.
 *
 * `gramsPerUnit` is the number of grams one unit represents, or `null` for
 * count-based units such as `qty` that have no mass conversion.
 */
export interface Unit {
  code: string;
  label: string;
  gramsPerUnit: number | null;
}

/**
 * The shared error envelope returned for every non-2xx API response
 * (references/contracts.md). Feature specs reuse this shape so the frontend
 * can surface failures consistently (AC-1.5).
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}
