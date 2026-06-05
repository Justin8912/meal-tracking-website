import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { errorEnvelopeSchema } from '@meal-tracking/shared';

const TEST_DATABASE_URL = process.env.DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('GET /healthz (integration)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 200 {status:"ok"} when the DB is reachable', async () => {
    const { buildServer } = await import('../server.js');
    app = await buildServer({ databaseUrl: TEST_DATABASE_URL! });
    await app.ready();

    const res = await request(app.server).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 503 with the error envelope when the DB is unreachable', async () => {
    const { buildServer } = await import('../server.js');
    // Point the pool at an unreachable host/port.
    app = await buildServer({
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:1/nope',
    });
    await app.ready();

    const res = await request(app.server).get('/healthz');
    expect(res.status).toBe(503);
    const parsed = errorEnvelopeSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body.error.code).toBeTruthy();
    expect(res.body.error.message).toBeTruthy();
  });
});
