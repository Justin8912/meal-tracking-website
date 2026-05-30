import { z } from 'zod';
import type { Workspace, Unit, ErrorEnvelope } from './types.js';

/**
 * Runtime-validating Zod schemas matching the shared domain types. The API
 * validates inputs and outputs against these at the boundary (S-3); the
 * frontend imports the same schemas so the contract cannot drift.
 */

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().min(1),
}) satisfies z.ZodType<Workspace>;

export const unitSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  gramsPerUnit: z.number().nullable(),
}) satisfies z.ZodType<Unit>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
}) satisfies z.ZodType<ErrorEnvelope>;
