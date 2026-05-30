import { describe, it, expect } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('returns a typed config when all required env vars are set', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      PORT: '3000',
    });
    expect(config.databaseUrl).toBe('postgres://user:pass@localhost:5432/db');
    expect(config.port).toBe(3000);
  });

  it('defaults the port when PORT is not set', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    });
    expect(typeof config.port).toBe('number');
  });

  it('throws an error naming DATABASE_URL when it is missing', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('does not include secret values in the thrown error message', () => {
    expect(() => loadConfig({ PORT: 'not-a-number', DATABASE_URL: 'postgres://x' }))
      .toThrowError(/PORT/);
  });
});
