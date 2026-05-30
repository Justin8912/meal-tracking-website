import { describe, it, expect } from 'vitest';
import {
  workspaceSchema,
  unitSchema,
  errorEnvelopeSchema,
} from './schemas.js';

describe('workspaceSchema', () => {
  it('parses a valid workspace', () => {
    const result = workspaceSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Default',
      createdAt: '2026-05-30T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a workspace with a non-uuid id', () => {
    const result = workspaceSchema.safeParse({
      id: 'not-a-uuid',
      name: 'Default',
      createdAt: '2026-05-30T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a workspace missing the name', () => {
    const result = workspaceSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      createdAt: '2026-05-30T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('unitSchema', () => {
  it('parses a valid unit with a numeric gramsPerUnit', () => {
    const result = unitSchema.safeParse({
      code: 'g',
      label: 'gram',
      gramsPerUnit: 1,
    });
    expect(result.success).toBe(true);
  });

  it('parses a unit with a null gramsPerUnit (qty)', () => {
    const result = unitSchema.safeParse({
      code: 'qty',
      label: 'quantity',
      gramsPerUnit: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a unit with a null code', () => {
    const result = unitSchema.safeParse({
      code: null,
      label: 'gram',
      gramsPerUnit: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a unit missing the label', () => {
    const result = unitSchema.safeParse({
      code: 'g',
      gramsPerUnit: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('errorEnvelopeSchema', () => {
  it('parses a valid error envelope', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'DB_UNAVAILABLE', message: 'Database is unreachable' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an envelope missing error.code', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { message: 'something failed' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an envelope missing error.message', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'SOME_CODE' },
    });
    expect(result.success).toBe(false);
  });
});
