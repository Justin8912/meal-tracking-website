import { z } from 'zod';

/**
 * Environment configuration loader.
 *
 * All secrets (DB credentials via DATABASE_URL) are read here from the process
 * environment and nowhere else (S-1). There are no hardcoded credential
 * fallbacks. The loader fails fast at startup with a clear error naming the
 * missing/invalid variable, so a misconfiguration surfaces as a boot error
 * rather than an obscure crash deep in the DB layer (AC-1.5).
 */

const envSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL is required'),
  PORT: z.coerce
    .number({ invalid_type_error: 'PORT must be a number' })
    .int('PORT must be an integer')
    .positive('PORT must be positive')
    .default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // USDA FoodData Central API key. Read ONLY from the runtime environment
  // (S-2): it is never bundled client-side or baked into a build ARG. Optional
  // so the server still boots without it; the USDA proxy degrades to
  // cache/custom entry when it is absent (AD-3, NFR-5). An empty string (e.g.
  // Compose substituting an unset ${USDA_API_KEY}) is treated as absent so the
  // server degrades gracefully rather than failing config validation.
  USDA_API_KEY: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Override for the USDA base URL (defaults to production). Lets tests point
  // the client at a stub server without touching the real upstream.
  USDA_BASE_URL: z.string().url().default('https://api.nal.usda.gov/fdc/v1'),
  // Browser origin allowed to call the API cross-origin (AD-5). The SPA is
  // served from a different origin (nginx :8080) than the API (:3000), so the
  // browser enforces CORS. Defaults to "*" (reflect any Origin) so the app works
  // from localhost, 127.0.0.1, a LAN IP, or a hostname without per-host config;
  // set it to a specific http(s) URL to lock it down.
  CORS_ORIGIN: z
    .string()
    .refine((v) => v === '*' || /^https?:\/\//.test(v), {
      message: 'CORS_ORIGIN must be "*" or an http(s) URL',
    })
    .default('*'),
});

export interface AppConfig {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: string;
  /** USDA API key, or undefined when not configured (S-2). */
  usdaApiKey: string | undefined;
  /** USDA FoodData Central base URL. */
  usdaBaseUrl: string;
  /** Browser origin allowed to call the API cross-origin (AD-5). */
  corsOrigin: string;
}

/**
 * Parse and validate configuration from an environment record.
 *
 * @param env - The environment source. Defaults to `process.env`.
 * @throws Error naming the offending variable(s) when validation fails. The
 *         message never echoes secret values.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const name = issue.path.join('.') || '(root)';
        return `${name}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    usdaApiKey: parsed.data.USDA_API_KEY,
    usdaBaseUrl: parsed.data.USDA_BASE_URL,
    corsOrigin: parsed.data.CORS_ORIGIN,
  };
}

/**
 * Lazily-loaded singleton config from `process.env`. Importing this evaluates
 * the environment once at module load.
 */
let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}
