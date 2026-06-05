/**
 * Runtime configuration shape injected by env-config.js (AD-5).
 *
 * window._env_ is populated at container start (envsubst -> env-config.js) and read
 * by the API client at runtime. This is deliberately NOT import.meta.env, which Vite
 * would bake at build time (F-3). Only the non-secret API base URL lives here.
 */
interface RuntimeEnv {
  API_BASE_URL: string;
}

interface Window {
  _env_?: RuntimeEnv;
}
