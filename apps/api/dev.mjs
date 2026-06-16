/**
 * Dev-mode entry point for the API.
 *
 * Loads the repo-root .env file into process.env before spawning tsx watch,
 * so DATABASE_URL and friends are available without setting shell vars manually.
 * Uses only Node built-ins — no extra packages required.
 *
 * Variables already present in the shell take precedence over .env values.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const envPath = resolve(repoRoot, '.env');

try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1);
    // Shell-set vars win; only fill in what isn't already defined.
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not found — proceed without it; the API will fail fast on missing vars.
}

const result = spawnSync('tsx', ['watch', 'src/server.ts'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
