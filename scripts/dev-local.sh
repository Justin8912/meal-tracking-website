#!/usr/bin/env bash
#
# dev-local.sh — run the meal-tracking app locally WITHOUT a Docker image build.
#
# Why: this machine cannot install npm deps from the registry, but node_modules
# is already installed locally and runs natively. Only Postgres runs in a
# container (image PULLs work; only image BUILDs are blocked). The API and web
# run from the already-installed deps via tsx / vite — no `npm install`, no
# lockfile, no image build.
#
# Usage:
#   scripts/dev-local.sh            # start pg (if needed), migrate, run api + web
#   scripts/dev-local.sh --stop     # stop & remove the dev Postgres container
#
# Then open the Vite dev URL it prints (http://localhost:5173).
# Ctrl-C stops the api + web; the Postgres container is left running for next time
# (remove it with `scripts/dev-local.sh --stop`).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PG_CONTAINER="mt-dev-pg"
PG_USER="postgres"
PG_PASSWORD="changeme"
PG_DB="mealtracking"
PG_PORT="5432"
DATABASE_URL="postgres://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}"

WEB_ORIGIN="http://localhost:5173"   # vite dev default
API_PORT="3000"                      # apps/web/public/env-config.js points the SPA here

if [[ "${1:-}" == "--stop" ]]; then
  echo "Stopping & removing ${PG_CONTAINER}..."
  docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  echo "Done."
  exit 0
fi

# --- 1. Postgres (container) -------------------------------------------------
if docker ps -a --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
  docker start "${PG_CONTAINER}" >/dev/null
  echo "Postgres container ${PG_CONTAINER} started (reusing existing)."
else
  echo "Creating Postgres container ${PG_CONTAINER}..."
  docker run -d --name "${PG_CONTAINER}" \
    -e POSTGRES_USER="${PG_USER}" \
    -e POSTGRES_PASSWORD="${PG_PASSWORD}" \
    -e POSTGRES_DB="${PG_DB}" \
    -p "${PG_PORT}:5432" \
    postgres:16-alpine >/dev/null
fi

echo -n "Waiting for Postgres to accept connections"
for _ in $(seq 1 30); do
  if docker exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
    echo " - ready."
    break
  fi
  echo -n "."
  sleep 1
done

# --- 2. Build the workspace packages the API resolves at runtime -------------
# shared + nutrition-engine are imported by the API; build their dist once so
# tsx resolves them. (Pure local tsc compile — no network.)
echo "Building shared + nutrition-engine (local tsc, no network)..."
npm run build -w @meal-tracking/shared >/dev/null
npm run build -w @meal-tracking/nutrition-engine >/dev/null

# --- 3. Apply DB migrations (0001 -> 0002 -> 0003) via tsx (no build) --------
echo "Applying migrations..."
( cd apps/api && DATABASE_URL="${DATABASE_URL}" npx tsx src/db/migrate.ts )

# --- 4. Run API (background) + web (foreground) ------------------------------
echo "Starting API on http://localhost:${API_PORT} ..."
(
  cd apps/api
  DATABASE_URL="${DATABASE_URL}" \
  PORT="${API_PORT}" \
  HOST="127.0.0.1" \
  CORS_ORIGIN="${WEB_ORIGIN}" \
  LOG_LEVEL="info" \
  npx tsx watch src/server.ts
) &
API_PID=$!

# Stop the API when this script exits (Ctrl-C). Postgres is left running.
cleanup() {
  echo
  echo "Stopping API (pid ${API_PID})..."
  kill "${API_PID}" >/dev/null 2>&1 || true
  echo "API stopped. Postgres (${PG_CONTAINER}) left running - 'scripts/dev-local.sh --stop' to remove it."
}
trap cleanup EXIT INT TERM

echo
echo "==============================================================="
echo " API:  http://localhost:${API_PORT}   (health: /healthz)"
echo " Web:  starting Vite dev server below - open the printed URL"
echo "       (default http://localhost:5173)"
echo " CORS: API allows origin ${WEB_ORIGIN}"
echo " Note: USDA_API_KEY is unset - ingredient search will show its"
echo "       error+custom-entry fallback; everything else works."
echo "==============================================================="
echo

# Web dev server in the foreground (Ctrl-C here stops everything).
cd apps/web && npx vite
