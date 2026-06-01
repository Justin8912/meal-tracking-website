import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server.js';

/**
 * CORS is independent of the database (it is enforced by @fastify/cors before
 * any route handler runs), so this suite runs in the default no-DB run. It uses
 * an unreachable DB DSN purely to satisfy buildServer; no query is issued.
 */
const UNUSED_DB_URL = 'postgres://postgres:postgres@127.0.0.1:1/nope';
const WEB_ORIGIN = 'http://localhost:8080';

describe('CORS (browser SPA calls the API cross-origin, AD-5)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('echoes Access-Control-Allow-Origin for the configured web origin on a cross-origin request', async () => {
    app = await buildServer({ databaseUrl: UNUSED_DB_URL, corsOrigin: WEB_ORIGIN });
    await app.ready();

    // Hitting an unknown route avoids touching the (unreachable) DB while still
    // exercising the CORS onRequest hook. The 404 envelope is irrelevant here;
    // what matters is the CORS header on a request carrying a cross-origin Origin.
    const res = await request(app.server)
      .get('/api/v1/__cors_probe__')
      .set('Origin', WEB_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
  });

  it('answers a preflight OPTIONS for the configured origin with the allowed methods', async () => {
    app = await buildServer({ databaseUrl: UNUSED_DB_URL, corsOrigin: WEB_ORIGIN });
    await app.ready();

    const res = await request(app.server)
      .options('/api/v1/recipes')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    // Preflight succeeds without reaching a route handler.
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('reflects any Origin by default (allow-all) when none is configured', async () => {
    app = await buildServer({ databaseUrl: UNUSED_DB_URL });
    await app.ready();

    // Default CORS_ORIGIN is "*" -> reflect any origin, so the app works from
    // any host (localhost, 127.0.0.1, a LAN IP) without per-host config.
    const arbitraryOrigin = 'http://192.168.1.50:8080';
    const res = await request(app.server)
      .get('/api/v1/__cors_probe__')
      .set('Origin', arbitraryOrigin);

    expect(res.headers['access-control-allow-origin']).toBe(arbitraryOrigin);
  });
});
