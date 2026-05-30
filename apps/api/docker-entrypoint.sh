#!/bin/sh
# API container entrypoint (AD-2, AD-6).
#
# Applies versioned SQL migrations (S-5), then starts the server. Both steps run
# COMPILED JavaScript with plain Node (no tsx in the runtime image). All config,
# including DATABASE_URL, is read from the runtime environment (S-1) - never from
# a build ARG. Postgres readiness is gated by Compose (api depends_on postgres
# service_healthy), so migrations run against a live DB.
set -eu

cd /repo/apps/api

echo "Running database migrations..."
node dist/db/migrate.js

echo "Starting API server..."
exec node dist/server.js
