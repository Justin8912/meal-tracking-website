import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/**
 * GET /healthz - liveness + DB ping (NFR-4).
 *
 * Returns 200 {status:"ok"} only when a trivial query succeeds through the
 * pool. If the DB is unreachable it returns 503 with the shared error envelope
 * so an orchestrator (Compose) does not route traffic to an API that cannot
 * serve data. The route is intentionally unprefixed.
 */
export function registerHealthRoute(app: FastifyInstance, db: Db): void {
  app.get('/healthz', async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return reply.code(200).send({ status: 'ok' });
    } catch (err) {
      app.log.error({ err }, 'health check DB ping failed');
      return reply.code(503).send({
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'Database is not reachable',
        },
      });
    }
  });
}
