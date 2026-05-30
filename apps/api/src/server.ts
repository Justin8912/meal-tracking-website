import Fastify, {
  type FastifyInstance,
  type FastifyError,
} from 'fastify';
import type { ErrorEnvelope } from '@meal-tracking/shared';
import { getConfig, type AppConfig } from './config/env.js';
import { createDbHandle, type DbHandle } from './db/client.js';
import { registerHealthRoute } from './routes/health.js';
import { registerUnitsRoute } from './routes/units.js';
import { registerRecipesRoutes } from './routes/recipes.js';
import { registerTagsRoutes } from './routes/tags.js';
import { registerIngredientsRoutes } from './routes/ingredients.js';
import { createUsdaClient, type UsdaClient } from './usda/client.js';
import { createCachedUsdaClient } from './usda/cache.js';

/**
 * API base path for feature resources (references/contracts.md). The health
 * endpoint is intentionally registered unprefixed.
 */
export const API_BASE_PATH = '/api/v1';

export interface BuildServerOptions {
  /** Connection string for this server's DB pool. */
  databaseUrl: string;
  /** pino log level. Defaults to 'info'. */
  logLevel?: string;
  /** USDA api_key from runtime env (S-2). Optional; proxy degrades without it. */
  usdaApiKey?: string;
  /** USDA base URL override (defaults to the production FDC base). */
  usdaBaseUrl?: string;
  /**
   * Pre-built USDA client. Tests inject a stub here so the proxy routes never
   * hit the real USDA API or require the cache. When omitted, a cache-aside
   * client is built from the config above.
   */
  usdaClient?: UsdaClient;
}

/**
 * Build (but do not start listening on) a Fastify instance with pino structured
 * logging, a global error handler that emits the shared error envelope, and the
 * /healthz route. A fresh DB pool is created per server so tests can inject an
 * alternate or unreachable DB. The pool is closed on `onClose`.
 */
export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: options.logLevel ?? 'info',
      // pino emits structured JSON (NFR-4). Never log secret values (S-1, S-2):
      // the USDA api_key is redacted alongside DB credentials so it cannot leak
      // through request/error logging (AC-2.4).
      redact: [
        'req.headers.authorization',
        'databaseUrl',
        'DATABASE_URL',
        'usdaApiKey',
        'USDA_API_KEY',
        'api_key',
      ],
    },
  });

  const handle: DbHandle = createDbHandle(options.databaseUrl);
  app.addHook('onClose', async () => {
    await handle.close();
  });

  // Global error handler: serialize any thrown/persistence error into the
  // shared error envelope (AC-1.5) - never a raw stack or HTML page.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400
        ? error.statusCode
        : 500;
    request.log.error({ err: error }, 'request failed');
    const envelope: ErrorEnvelope = {
      error: {
        code: error.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
        message:
          statusCode >= 500 ? 'An unexpected error occurred' : error.message,
      },
    };
    reply.code(statusCode).send(envelope);
  });

  // 404s also use the shared envelope.
  app.setNotFoundHandler((request, reply) => {
    const envelope: ErrorEnvelope = {
      error: { code: 'NOT_FOUND', message: `Route ${request.url} not found` },
    };
    reply.code(404).send(envelope);
  });

  registerHealthRoute(app, handle.db);

  // USDA proxy client: a stub when injected (tests), otherwise a cache-aside
  // client over the raw USDA client built from runtime config (S-2, AD-3). The
  // key lives only in config and is never exposed to routes or responses.
  const usdaClient: UsdaClient =
    options.usdaClient ??
    createCachedUsdaClient(
      handle.db,
      createUsdaClient({
        usdaApiKey: options.usdaApiKey,
        usdaBaseUrl: options.usdaBaseUrl ?? 'https://api.nal.usda.gov/fdc/v1',
      }),
    );

  // Feature resources live under the shared API base path (contracts.md).
  await app.register(
    async (api) => {
      registerUnitsRoute(api, handle.db);
      registerRecipesRoutes(api, handle.db);
      registerTagsRoutes(api, handle.db);
      registerIngredientsRoutes(api, handle.db, usdaClient);
    },
    { prefix: API_BASE_PATH },
  );

  return app;
}

/**
 * Start the server from process.env config. Entry point for `npm start`.
 */
async function start(): Promise<void> {
  const config: AppConfig = getConfig();
  const app = await buildServer({
    databaseUrl: config.databaseUrl,
    logLevel: config.logLevel,
    usdaApiKey: config.usdaApiKey,
    usdaBaseUrl: config.usdaBaseUrl,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

// Only auto-start when run directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  void start();
}
