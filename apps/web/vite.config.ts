import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite build config (AD-5). No environment-specific API URL is configured here:
// the API base URL is injected at runtime via window._env_ (env-config.js), not
// baked at build time (F-3). Test config lives in vitest.config.ts to avoid a
// dual-vite type clash between the build and test toolchains.
export default defineConfig({
  plugins: [react()],
});
